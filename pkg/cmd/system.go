package cmd

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/cloud-native-application/rudrx/pkg/oam"

	"github.com/cloud-native-application/rudrx/pkg/builtin/traitdefinition"

	"github.com/cloud-native-application/rudrx/pkg/builtin/workloaddefinition"

	"github.com/ghodss/yaml"

	"github.com/cloud-native-application/rudrx/api/types"

	"k8s.io/apimachinery/pkg/runtime"

	oamv1 "github.com/crossplane/oam-kubernetes-runtime/apis/core/v1alpha2"

	"github.com/spf13/cobra"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/pkg/errors"
	kubeerrors "k8s.io/apimachinery/pkg/api/errors"

	cmdutil "github.com/cloud-native-application/rudrx/pkg/cmd/util"
)

type initCmd struct {
	namespace string
	ioStreams cmdutil.IOStreams
	client    client.Client
	version   string
}

type infoCmd struct {
	out io.Writer
}

var (
	defaultObject = []interface{}{
		&oamv1.WorkloadDefinition{},
		&oamv1.ApplicationConfiguration{},
		&oamv1.Component{},
		&oamv1.TraitDefinition{},
		&oamv1.ContainerizedWorkload{},
		&oamv1.HealthScope{},
		&oamv1.ManualScalerTrait{},
		&oamv1.ScopeDefinition{},
	}

	workloadResource = map[string]string{
		"deployments.apps":                    workloaddefinition.Deployment,
		"containerizedworkloads.core.oam.dev": workloaddefinition.ContainerizedWorkload,
	}

	traitResource = map[string]string{
		"manualscalertraits.core.oam.dev":    traitdefinition.ManualScaler,
		"simplerollouttraits.extend.oam.dev": traitdefinition.SimpleRollout,
	}
)

func SystemCommandGroup(c types.Args, ioStream cmdutil.IOStreams) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "system",
		Short: "system management utilities",
		Long:  "system management utilities",
		Annotations: map[string]string{
			types.TagCommandType: types.TypeSystem,
		},
	}
	cmd.AddCommand(NewAdminInitCommand(c, ioStream), NewAdminInfoCommand(ioStream), NewRefreshCommand(c, ioStream))
	return cmd
}

func NewAdminInfoCommand(ioStreams cmdutil.IOStreams) *cobra.Command {
	i := &infoCmd{out: ioStreams.Out}

	cmd := &cobra.Command{
		Use:   "info",
		Short: "show vela client and cluster version",
		Long:  "show vela client and cluster version",
		RunE: func(cmd *cobra.Command, args []string) error {
			return i.run(ioStreams)
		},
		Annotations: map[string]string{
			types.TagCommandType: types.TypeSystem,
		},
	}
	return cmd
}

func (i *infoCmd) run(ioStreams cmdutil.IOStreams) error {
	clusterVersion, err := GetOAMReleaseVersion()
	if err != nil {
		ioStreams.Errorf("fail to get cluster version, err: %v \n", err)
		return err
	}
	ioStreams.Info("Versions:")
	ioStreams.Infof("oam-kubernetes-runtime: %s \n", clusterVersion)
	// TODO(wonderflow): we should print all helm charts installed by vela, including plugins

	return nil
}

func NewAdminInitCommand(c types.Args, ioStreams cmdutil.IOStreams) *cobra.Command {
	i := &initCmd{ioStreams: ioStreams}
	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize vela on both client and server",
		Long:  "Install OAM runtime and vela builtin capabilities.",
		RunE: func(cmd *cobra.Command, args []string) error {
			newClient, err := client.New(c.Config, client.Options{Scheme: c.Schema})
			if err != nil {
				return err
			}
			i.client = newClient
			i.namespace = types.DefaultOAMNS
			return i.run(ioStreams)
		},
		Annotations: map[string]string{
			types.TagCommandType: types.TypeSystem,
		},
	}

	flag := cmd.Flags()
	flag.StringVarP(&i.version, "version", "v", "", "Override chart version")

	return cmd
}

func (i *initCmd) run(ioStreams cmdutil.IOStreams) error {
	ioStreams.Info("- Installing OAM Kubernetes Runtime:")
	if !cmdutil.IsNamespaceExist(i.client, types.DefaultOAMNS) {
		if err := cmdutil.NewNamespace(i.client, types.DefaultOAMNS); err != nil {
			return err
		}
	}

	if i.IsOamRuntimeExist() {
		i.ioStreams.Info("Vela system along with OAM runtime already exist.")
	}

	if err := InstallOamRuntime(ioStreams, i.version); err != nil {
		return err
	}

	ioStreams.Info("- Installing builtin capabilities:")
	if err := GenNativeResourceDefinition(i.client); err != nil {
		return err
	}
	ioStreams.Info()
	if err := RefreshDefinitions(context.Background(), i.client, ioStreams); err != nil {
		return err
	}
	ioStreams.Info("- Finished.")
	return nil
}

func (i *initCmd) IsOamRuntimeExist() bool {
	for _, object := range defaultObject {
		if err := cmdutil.IsCoreCRDExist(context.Background(), i.client, object.(runtime.Object)); err != nil {
			return false
		}
	}
	return oam.IsHelmReleaseRunning(types.DefaultOAMReleaseName, types.DefaultOAMRuntimeChartName, i.ioStreams)
}

func InstallOamRuntime(ioStreams cmdutil.IOStreams, version string) error {
	return oam.HelmInstall(ioStreams, types.DefaultOAMRepoName, types.DefaultOAMRepoURL, types.DefaultOAMRuntimeChartName, version, types.DefaultOAMReleaseName, nil)
}

func GetOAMReleaseVersion() (string, error) {
	results, err := oam.GetHelmRelease()
	if err != nil {
		return "", err
	}

	for _, result := range results {
		if result.Chart.ChartFullPath() == types.DefaultOAMRuntimeChartName {
			return result.Chart.AppVersion(), nil
		}
	}
	return "", errors.New("oam-kubernetes-runtime not found in your kubernetes cluster, try `vela system init` to install")
}

func GenNativeResourceDefinition(c client.Client) error {
	var capabilities []string
	ctx := context.Background()
	for name, manifest := range workloadResource {
		wd := NewWorkloadDefinition(manifest)
		capabilities = append(capabilities, name)
		nwd := &oamv1.WorkloadDefinition{}
		err := c.Get(ctx, client.ObjectKey{Name: name}, nwd)
		if err != nil && kubeerrors.IsNotFound(err) {
			if err := c.Create(context.Background(), &wd); err != nil {
				return fmt.Errorf("create workload definition %s hit an issue: %v", name, err)
			}
			continue
		}
		wd.ResourceVersion = nwd.ResourceVersion
		if err := c.Update(ctx, &wd); err != nil {
			return fmt.Errorf("update workload definition %s err %v", wd.Name, err)
		}
	}

	for name, manifest := range traitResource {
		td := NewTraitDefinition(manifest)
		capabilities = append(capabilities, name)
		ntd := &oamv1.TraitDefinition{}
		err := c.Get(context.Background(), client.ObjectKey{Name: name}, ntd)
		if err != nil && kubeerrors.IsNotFound(err) {
			if err := c.Create(context.Background(), &td); err != nil {
				return fmt.Errorf("create trait definition %s hit an issue: %v", name, err)
			}
			continue
		}
		td.ResourceVersion = ntd.ResourceVersion
		if err := c.Update(ctx, &td); err != nil {
			return fmt.Errorf("update trait definition %s err %v", td.Name, err)
		}
	}

	fmt.Printf("Successful applied %d kinds of Workloads and Traits: %s.", len(capabilities), strings.Join(capabilities, ","))
	return nil
}

func NewWorkloadDefinition(manifest string) oamv1.WorkloadDefinition {
	var workloadDefinition oamv1.WorkloadDefinition
	// We have tests to make sure built-in resource can always unmarshal succeed
	_ = yaml.Unmarshal([]byte(manifest), &workloadDefinition)
	return workloadDefinition
}

func NewTraitDefinition(manifest string) oamv1.TraitDefinition {
	var traitDefinition oamv1.TraitDefinition
	// We have tests to make sure built-in resource can always unmarshal succeed
	_ = yaml.Unmarshal([]byte(manifest), &traitDefinition)
	return traitDefinition
}
