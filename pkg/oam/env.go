package oam

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	corev1 "k8s.io/api/core/v1"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/cloud-native-application/rudrx/api/types"
	"github.com/cloud-native-application/rudrx/pkg/utils/system"
)

func GetEnvByName(name string) (*types.EnvMeta, error) {
	data, err := ioutil.ReadFile(filepath.Join(system.GetEnvDirByName(name), system.EnvConfigName))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("env %s not exist", name)
		}
		return nil, err
	}
	var meta types.EnvMeta
	if err = json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

func CreateOrUpdateEnv(ctx context.Context, c client.Client, envName string, namespace string) (string, error) {
	var message = ""
	var envArgs types.EnvMeta
	envArgs.Name = envName
	envArgs.Namespace = namespace
	data, err := json.Marshal(envArgs)
	if err != nil {
		return message, err
	}
	envdir, err := system.GetEnvDir()
	if err != nil {
		return message, err
	}
	subEnvDir := filepath.Join(envdir, envName)
	if _, err = system.CreateIfNotExist(subEnvDir); err != nil {
		return message, err
	}
	if err = ioutil.WriteFile(filepath.Join(subEnvDir, system.EnvConfigName), data, 0644); err != nil {
		return message, err
	}
	curEnvPath, err := system.GetCurrentEnvPath()
	if err != nil {
		return message, err
	}
	if err := c.Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: envArgs.Namespace}}); err != nil && !apierrors.IsAlreadyExists(err) {
		return message, err
	}

	if err = ioutil.WriteFile(curEnvPath, []byte(envName), 0644); err != nil {
		return message, err
	}
	message = fmt.Sprintf("Create env succeed, current env is " + envName + " namespace is " + envArgs.Namespace + ", use --namespace=<namespace> to specify namespace with env init")
	return message, nil
}

func ListEnvs(envName string) ([]*types.EnvMeta, error) {
	var envList []*types.EnvMeta
	if envName != "" {
		env, err := GetEnvByName(envName)
		if err != nil {
			if os.IsNotExist(err) {
				err = fmt.Errorf("env %s not exist", envName)
			}
			return envList, err
		}
		envList = append(envList, env)
		return envList, err
	}
	envDir, err := system.GetEnvDir()
	if err != nil {
		return envList, err
	}
	files, err := ioutil.ReadDir(envDir)
	if err != nil {
		return envList, err
	}
	curEnv, err := GetCurrentEnvName()
	if err != nil {
		curEnv = types.DefaultEnvName
	}
	for _, f := range files {
		if !f.IsDir() {
			continue
		}
		data, err := ioutil.ReadFile(filepath.Join(envDir, f.Name(), system.EnvConfigName))
		if err != nil {
			continue
		}
		var envMeta types.EnvMeta
		if err = json.Unmarshal(data, &envMeta); err != nil {
			continue
		}
		if curEnv == f.Name() {
			envMeta.Current = "*"
		}
		envList = append(envList, &envMeta)
	}
	return envList, nil
}

func GetCurrentEnvName() (string, error) {
	currentEnvPath, err := system.GetCurrentEnvPath()
	if err != nil {
		return "", err
	}
	data, err := ioutil.ReadFile(currentEnvPath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func DeleteEnv(envName string) (string, error) {
	var message string
	var err error
	curEnv, err := GetCurrentEnvName()
	if err != nil {
		return message, err
	}
	if envName == curEnv {
		err = fmt.Errorf("you can't delete current using env %s", curEnv)
		return message, err
	}
	envdir, err := system.GetEnvDir()
	if err != nil {
		return message, err
	}
	envPath := filepath.Join(envdir, envName)
	if _, err := os.Stat(envPath); err != nil {
		if os.IsNotExist(err) {
			err = fmt.Errorf("%s does not exist", envName)
			return message, err
		}
	}
	if err = os.RemoveAll(envPath); err != nil {
		return message, err
	}
	message = envName + " deleted"
	return message, err
}

func SwitchEnv(envName string) (string, error) {
	var msg string
	currentEnvPath, err := system.GetCurrentEnvPath()
	if err != nil {
		return msg, err
	}
	envMeta, err := GetEnvByName(envName)
	if err != nil {
		return msg, err
	}
	if err = ioutil.WriteFile(currentEnvPath, []byte(envName), 0644); err != nil {
		return msg, err
	}
	msg = fmt.Sprintf("Switch env succeed, current env is " + envName + ", namespace is " + envMeta.Namespace)
	return msg, nil
}
