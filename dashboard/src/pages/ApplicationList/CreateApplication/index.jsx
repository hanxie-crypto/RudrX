import React, { Fragment } from 'react';
import { PageContainer } from '@ant-design/pro-layout';
import './index.less';
import { Button, Row, Col, Form, Input, Select, Steps, message } from 'antd';
import { connect } from 'dva';
import { Link } from 'umi';
import _ from 'lodash';
import CreateTraitItem from '../createTrait/index.jsx';

const { Option } = Select;
const { Step } = Steps;

const layout = {
  labelCol: {
    span: 8,
  },
  wrapperCol: {
    span: 16,
  },
};

@connect(({ loading, globalData }) => ({
  loadingAll: loading.models.workload,
  currentEnv: globalData.currentEnv,
}))
class TableList extends React.Component {
  formRefStep1 = React.createRef();

  formRefStep2All = React.createRef();

  constructor(props) {
    super(props);
    this.state = {
      current: 0,
      isShowMore: false,
      traitNum: [
        {
          refname: null,
          initialData: {},
          uniq: new Date().valueOf(),
        },
      ],
      traitList: [],
      availableTraitList: [],
      workloadList: [],
      workloadSettings: [],
      step1SubmitObj: {},
      step1InitialValues: {
        workload_type: '',
      },
      step1Settings: [],
    };
  }

  UNSAFE_componentWillMount() {
    const activeStep = _.get(this.props, 'location.state.activeStep', 0);
    this.setState(() => ({
      current: activeStep,
    }));
  }

  componentDidMount() {
    this.getInitalData();
  }

  getInitalData = async () => {
    const res = await this.props.dispatch({
      type: 'workload/getWorkload',
    });
    const traits = await this.props.dispatch({
      type: 'trait/getTraits',
    });
    this.setState({
      traitList: traits,
    });
    // 如果直接跳转到第二步，需要设置值
    const traitType = _.get(this.props, 'location.state.TraitType', '');
    if (traitType) {
      // let availableTraitList = traits.filter((item)=>{
      //   return item.name === traitType
      // })
      this.setState({
        availableTraitList: traits,
        traitNum: [
          {
            refname: null,
            initialData: { name: traitType },
            uniq: new Date().valueOf(),
          },
        ],
      });
    }

    if (Array.isArray(res) && res.length) {
      this.setState(
        () => ({
          workloadList: res,
        }),
        () => {
          if (this.state.current === 0) {
            const WorkloadType = _.get(this.props, 'location.state.WorkloadType', '');
            this.formRefStep1.current.setFieldsValue({
              workload_type: WorkloadType || this.state.workloadList[0].name,
            });
            this.workloadTypeChange(this.state.workloadList[0].name);
          }
        },
      );
    }
  };

  onFinishStep1 = (values) => {
    this.setState({
      current: 1,
      step1InitialValues: values,
      isShowMore: false,
    });
  };

  onFinishStep2 = () => {
    const newTraitNum = this.state.traitNum.map((item) => {
      // eslint-disable-next-line no-param-reassign
      item.initialData = item.refname.getSelectValue();
      return item;
    });
    // 进行trait数据整理，便于第三步展示
    this.setState(() => ({
      traitNum: newTraitNum,
      current: 2,
    }));
  };

  gotoStep2 = () => {
    this.setState({
      current: 1,
      isShowMore: false,
    });
  };

  gotoStep1 = () => {
    this.setState({
      current: 0,
    });
  };

  changeShowMore = () => {
    this.setState({
      isShowMore: true,
    });
  };

  addMore = (e) => {
    e.preventDefault();
    this.setState((prev) => ({
      traitNum: prev.traitNum.concat([
        {
          refname: null,
          initialData: {},
          uniq: new Date().valueOf(),
        },
      ]),
    }));
  };

  createApp = async () => {
    const { step1SubmitObj, traitNum } = this.state;
    const submitObj = _.cloneDeep(step1SubmitObj);
    const { workload_name: workloadName } = step1SubmitObj;
    submitObj.flags.push({
      name: 'name',
      value: workloadName.toString(),
    });
    // 处理数据为提交的格式
    if (traitNum.length) {
      const { env_name: envName } = step1SubmitObj;
      const step2SubmitObj = [];
      traitNum.forEach(({ initialData }) => {
        if (initialData.name) {
          const initialObj = {
            name: initialData.name,
            env_name: envName,
            workload_name: workloadName,
            flags: [],
          };
          Object.keys(initialData).forEach((key) => {
            if (key !== 'name' && initialData[key]) {
              initialObj.flags.push({
                name: key,
                value: initialData[key].toString(),
              });
            }
          });
          step2SubmitObj.push(initialObj);
        }
      });
      submitObj.traits = step2SubmitObj;
    }
    const res = await this.props.dispatch({
      type: 'workload/createWorkload',
      payload: {
        params: submitObj,
      },
    });
    if (res) {
      message.success(res);
      this.props.history.push({
        pathname: '/ApplicationList',
      });
    }
  };

  createWorkload = async () => {
    await this.formRefStep1.current.validateFields();
    const currentData = this.formRefStep1.current.getFieldsValue();
    const submitObj = {
      env_name: this.props.currentEnv,
      workload_type: currentData.workload_type,
      workload_name: currentData.workload_name,
      flags: [],
    };
    Object.keys(currentData).forEach((key) => {
      if (key !== 'workload_name' && key !== 'workload_type' && currentData[key]) {
        submitObj.flags.push({
          name: key,
          value: currentData[key].toString(),
        });
      }
    });
    this.setState({
      current: 1,
      step1InitialValues: currentData,
      step1Settings: submitObj.flags,
      step1SubmitObj: submitObj,
    });
    this.getAcceptTrait(currentData.workload_type);
  };

  workloadTypeChange = (value) => {
    const content = this.formRefStep1.current.getFieldsValue();
    this.formRefStep1.current.resetFields();
    const initialObj = {
      workload_type: content.workload_type,
      workload_name: content.workload_name,
    };
    this.formRefStep1.current.setFieldsValue(initialObj);
    const currentWorkloadSetting = this.state.workloadList.filter((item) => {
      return item.name === value;
    });
    if (currentWorkloadSetting.length) {
      this.setState(
        {
          workloadSettings: currentWorkloadSetting[0].parameters,
        },
        () => {
          this.state.workloadSettings.forEach((item) => {
            if (item.default) {
              initialObj[item.name] = item.default;
            }
          });
          this.formRefStep1.current.setFieldsValue(initialObj);
        },
      );
    }
    this.setState({
      traitNum: [
        {
          refname: null,
          initialData: {},
          uniq: new Date().valueOf(),
        },
      ],
    });
  };

  getAcceptTrait = (workloadType) => {
    const res = this.state.traitList.filter((item) => {
      if (item.appliesTo.indexOf(workloadType) !== -1) {
        return true;
      }
      return false;
    });
    this.setState(() => ({
      availableTraitList: res,
    }));
  };

  deleteTraitItem = (uniq) => {
    // 删除的时候不要依据数组的index删除,要一个唯一性的值
    this.state.traitNum = this.state.traitNum.filter((item) => {
      return item.uniq !== uniq;
    });
    // this.setState(()=>({
    //   traitNum: this.state.traitNum
    // }));
    this.setState((prev) => ({
      traitNum: prev.traitNum,
    }));
  };

  render() {
    const { current, step1InitialValues, traitNum, workloadSettings } = this.state;
    let { workloadList } = this.state;
    workloadList = Array.isArray(workloadList) ? workloadList : [];
    let currentDetail;
    if (current === 0) {
      currentDetail = (
        <div>
          <div className="minBox">
            <Form
              initialValues={step1InitialValues}
              labelAlign="left"
              {...layout}
              ref={this.formRefStep1}
              name="control-ref"
              onFinish={this.onFinishStep1}
              style={{ width: '60%' }}
            >
              <div style={{ padding: '16px 48px 0px 16px' }}>
                <Form.Item
                  name="workload_name"
                  label="Name"
                  rules={[
                    {
                      required: true,
                      message: 'Please input name!',
                    },
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="workload_type"
                  label="Workload Type"
                  rules={[
                    {
                      required: true,
                      message: 'Please select Workload Type!',
                    },
                  ]}
                >
                  <Select
                    placeholder="Select a Workload Type"
                    allowClear
                    onChange={this.workloadTypeChange}
                  >
                    {workloadList.length ? (
                      workloadList.map((item) => {
                        return (
                          <Option value={item.name} key={item.name}>
                            {item.name}
                          </Option>
                        );
                      })
                    ) : (
                      <></>
                    )}
                  </Select>
                </Form.Item>
                <Form.Item label="Settings" />
              </div>
              <div className="relativeBox">
                <p className="hasMore">?</p>
                {Array.isArray(workloadSettings) && workloadSettings.length ? (
                  workloadSettings.map((item) => {
                    if (item.name === 'name') {
                      return <Fragment key={item.name} />;
                    }
                    return (
                      <Form.Item
                        name={item.name}
                        label={item.name}
                        key={item.name}
                        rules={[
                          {
                            required: item.required,
                            message: `Please input ${item.name}!`,
                          },
                        ]}
                      >
                        <Input />
                      </Form.Item>
                    );
                  })
                ) : (
                  <></>
                )}
              </div>
              <div className="buttonBox">
                <Button type="primary" className="floatRightGap" onClick={this.createWorkload}>
                  Next
                </Button>
                <Link to="/ApplicationList">
                  <Button className="floatRightGap">Cancle</Button>
                </Link>
              </div>
            </Form>
          </div>
        </div>
      );
    } else if (current === 1) {
      currentDetail = (
        <div>
          <div className="minBox" style={{ width: '60%' }}>
            <div style={{ padding: '0px 48px 0px 16px', width: '60%' }}>
              <p style={{ fontSize: '18px', lineHeight: '32px' }}>
                Name:<span>{step1InitialValues.workload_name}</span>
              </p>
            </div>
            <div style={{ border: '1px solid #eee', padding: '16px 48px 16px 16px' }}>
              <p className="title">{step1InitialValues.workload_type}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>apps/v1</span>
                <span
                  style={{
                    color: '#1890ff',
                    cursor: 'pointer',
                    display: this.state.isShowMore ? 'none' : 'black',
                  }}
                  onClick={this.changeShowMore}
                >
                  more...
                </span>
              </div>
              {this.state.isShowMore ? (
                <div>
                  <p className="title" style={{ marginTop: '16px' }}>
                    Settings:
                  </p>
                  <Row>
                    {this.state.step1Settings.map((item) => {
                      return (
                        <Fragment key={item.name}>
                          <Col span="8">
                            <p>{item.name}:</p>
                          </Col>
                          <Col span="16">
                            <p>{item.value}</p>
                          </Col>
                        </Fragment>
                      );
                    })}
                  </Row>
                </div>
              ) : (
                ''
              )}
            </div>
            <div ref={this.formRefStep2All}>
              {traitNum.map((item) => {
                return (
                  <CreateTraitItem
                    onRef={(ref) => {
                      // eslint-disable-next-line no-param-reassign
                      item.refname = ref;
                    }}
                    key={item.uniq.toString()}
                    availableTraitList={this.state.availableTraitList}
                    uniq={item.uniq}
                    initialValues={item.initialData}
                    deleteTraitItem={this.deleteTraitItem}
                  />
                );
              })}
            </div>
            <button style={{ marginTop: '16px' }} onClick={this.addMore} type="button">
              Add More...
            </button>
            <div className="buttonBox">
              <Button type="primary" className="floatRight" onClick={this.onFinishStep2}>
                Next
              </Button>
              <Button className="floatRightGap" onClick={this.gotoStep1}>
                Back
              </Button>
            </div>
          </div>
        </div>
      );
    } else {
      currentDetail = (
        <div>
          <div className="minBox">
            <p>
              Name:<span>{step1InitialValues.workload_name}</span>
            </p>
            <Row>
              <Col span="11">
                <div className="summaryBox1">
                  <Row>
                    <Col span="22">
                      <p className="title">{step1InitialValues.workload_type}</p>
                      <p>apps/v1</p>
                    </Col>
                  </Row>
                  <p className="title hasMargin">Settings:</p>
                  <Row>
                    {this.state.step1Settings.map((item) => {
                      return (
                        <Fragment key={item.name}>
                          <Col span="8">
                            <p>{item.name}:</p>
                          </Col>
                          <Col span="16">
                            <p>{item.value}</p>
                          </Col>
                        </Fragment>
                      );
                    })}
                  </Row>
                </div>
              </Col>
              <Col span="1" />
              <Col span="10">
                {traitNum.map(({ initialData }, index) => {
                  if (initialData.name) {
                    return (
                      <div className="summaryBox" key={index.toString()}>
                        <Row>
                          <Col span="22">
                            <p className="title">{initialData.name}</p>
                            <p>core.oam.dev/v1alpha2</p>
                          </Col>
                        </Row>
                        <p className="title hasMargin">Properties:</p>
                        <Row>
                          {Object.keys(initialData).map((currentKey) => {
                            if (currentKey !== 'name') {
                              return (
                                <Fragment key={currentKey}>
                                  <Col span="8">
                                    <p>{currentKey}:</p>
                                  </Col>
                                  <Col span="16">
                                    <p>{initialData[currentKey]}</p>
                                  </Col>
                                </Fragment>
                              );
                            }
                            return <Fragment key={currentKey} />;
                          })}
                        </Row>
                      </div>
                    );
                  }
                  return <Fragment key={index.toString()} />;
                })}
              </Col>
            </Row>
          </div>
          <div className="buttonBox">
            {/* <Link to="/ApplicationList">
              <Button type="primary" className="floatRight">
                Confirm
              </Button>
            </Link> */}
            <Button
              type="primary"
              className="floatRight"
              onClick={() => {
                this.createApp();
              }}
            >
              Confirm
            </Button>
            <Button className="floatRightGap" onClick={this.gotoStep2}>
              Back
            </Button>
          </div>
        </div>
      );
    }
    return (
      <PageContainer>
        <div className="create-container create-app">
          <Steps current={current}>
            <Step title="Step 1" description="Choose Workload" />
            <Step title="Step 2" description="Attach Trait" />
            <Step title="Step 3" description="Review and confirm" />
          </Steps>
          {currentDetail}
        </div>
      </PageContainer>
    );
  }
}

export default TableList;
