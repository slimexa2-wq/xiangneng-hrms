import Taro from "@tarojs/taro";
import { Button, Checkbox, CheckboxGroup, Label, Text, View } from "@tarojs/components";
import { useEffect, useMemo, useRef, useState } from "react";
import { allJobs, allProjects, allPublicJobs, api } from "../api/services";
import type { RegistrationInput } from "../api/types";
import { normalizeRegistration, validateRegistration } from "../domain/validation";
import { useAsyncData } from "../hooks/useAsyncData";
import { DateField, FormField, SelectField, TextAreaField, TextField } from "./form";
import { AsyncBoundary, SectionCard, StatePanel } from "./ui";
import { RecruitmentSalary } from "./recruitment";
import { getSessionSnapshot, getSessionUser, isSessionCurrent, saveSessionIfCurrent } from "../auth/session";
import { applicationFormPath, loginPath } from "../domain/links";

const emptyForm = (source: RegistrationInput["source"]): RegistrationInput => ({
  name: "",
  idCard: "",
  phone: "",
  projectId: "",
  jobDemandId: null,
  jobTitle: "",
  interviewDate: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelation: null,
  source,
  notes: null
});

export function RegistrationForm({
  source,
  initialJobId,
  publicMode = false,
  referralToken,
  submitText,
  onSuccess
}: {
  source: RegistrationInput["source"];
  initialJobId?: string;
  publicMode?: boolean;
  referralToken?: string;
  submitText: string;
  onSuccess?: () => void;
}) {
  const [form, setForm] = useState<RegistrationInput>(() => emptyForm(source));
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [consent, setConsent] = useState(false);
  const [showOptional, setShowOptional] = useState(source === "OPERATOR" || source === "SUPPLIER");
  const needsConsent = source === "SELF" || source === "REFERRAL";
  const account = getSessionUser();
  const ownApplication = source === "SELF" && !publicMode && Boolean(account?.personId);
  const projects = useAsyncData(
    () => source === "OPERATOR" ? allProjects() : Promise.resolve(null),
    [source]
  );
  const jobs = useAsyncData(
    () => publicMode ? allPublicJobs({ status: "RECRUITING" }) : allJobs({ status: "RECRUITING" }),
    [publicMode]
  );

  const projectOptions = source === "OPERATOR"
    ? (projects.data?.items ?? []).map((item) => ({ label: item.name, value: item.id }))
    : Array.from(new Map(
        (jobs.data?.items ?? []).map((item) => [
          item.projectId,
          { label: item.project?.name ?? item.projectName ?? "综合招聘项目", value: item.projectId }
        ])
      ).values());
  const availableJobs = useMemo(
    () => (jobs.data?.items ?? []).filter((item) => !form.projectId || item.projectId === form.projectId),
    [form.projectId, jobs.data]
  );
  const jobOptions = availableJobs.map((item) => ({ label: item.title, value: item.id }));
  const selectedJob = jobs.data?.items.find((item) => item.id === form.jobDemandId);
  const initialJob = jobs.data?.items.find((item) => item.id === initialJobId);
  const fixedJob = Boolean(initialJobId && initialJob && source !== "OPERATOR");

  useEffect(() => {
    if (!initialJobId || !jobs.data) return;
    const job = jobs.data.items.find((item) => item.id === initialJobId);
    if (job) {
      setForm((current) => ({ ...current, projectId: job.projectId, jobDemandId: job.id, jobTitle: job.title }));
    }
  }, [initialJobId, jobs.data]);

  const update = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectJob = (id: string) => {
    const job = jobs.data?.items.find((item) => item.id === id);
    update("jobDemandId", id);
    if (job) {
      setForm((current) => ({ ...current, jobDemandId: id, projectId: job.projectId, jobTitle: job.title }));
    }
  };

  const submit = async () => {
    if (submittingRef.current) return;
    if (needsConsent && !consent) {
      await Taro.showToast({ title: "请先阅读并同意报名隐私说明", icon: "none" });
      return;
    }
    const input = normalizeRegistration(form);
    const errors = ownApplication ? [] : validateRegistration(input);
    if (errors.length) {
      await Taro.showModal({ title: "请完善报名信息", content: errors.join("\n"), showCancel: false });
      return;
    }
    if (source !== "OPERATOR" && !input.jobDemandId) {
      await Taro.showToast({ title: "请选择招聘岗位", icon: "none" });
      return;
    }
    if (initialJobId && source !== "OPERATOR" && (!initialJob || input.jobDemandId !== initialJob.id)) {
      await Taro.showToast({ title: "岗位信息已变化，请重新选择", icon: "none" });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    let session = getSessionSnapshot();
    try {
      let accountRefreshed = true;
      if (publicMode) {
        await api.createPublicApplication({ ...input, referralToken, consent: true });
      } else if (source === "OPERATOR") {
        await api.registerPerson(input);
      } else if (source === "REFERRAL") {
        await api.createReferral({ ...input, consent: true });
      } else {
        if (ownApplication && input.jobDemandId) await api.applyOwnJob(input.jobDemandId, { consent: true, referralToken });
        else await api.createApplication({ ...input, referralToken, consent: needsConsent ? true : undefined });
        if (!isSessionCurrent(session)) return;
        if (source === "SELF") {
          try {
            if (!session.token) throw new Error("登录已失效");
            const currentUser = await api.me();
            if (!saveSessionIfCurrent(session, currentUser)) return;
            session = getSessionSnapshot();
          } catch { accountRefreshed = false; }
        }
      }
      if (!isSessionCurrent(session)) return;
      await Taro.showModal({
        title: source === "REFERRAL" ? "推荐已提交" : "报名已提交",
        content: publicMode
          ? "负责人将根据岗位安排联系你。匿名报名后，需由负责人核实身份并把档案绑定到本人账号，才能查询进度。"
          : source === "REFERRAL" ? "推荐已记录，进度和奖励以本人推荐记录中的实际状态为准。" : source === "SUPPLIER" ? "报人信息已记录，请在我的人员查看进度。" : source === "OPERATOR" ? "报名已记录，请在人员查询中继续跟进。" : accountRefreshed ? "报名已记录，请留意负责人联系。可在我的报名中查看进度。" : "报名已记录，账号资料暂时无法刷新。请重新登录后查看本人报名进度。",
        showCancel: false
      });
      setForm(emptyForm(source));
      setConsent(false);
      onSuccess?.();
    } catch (error) {
      if (!isSessionCurrent(session)) return;
      await Taro.showModal({
        title: "提交失败",
        content: error instanceof Error ? error.message : "请稍后重试",
        showCancel: false
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!jobs.loading && !jobs.error && initialJobId && !initialJob) return <StatePanel title="该岗位暂时无法报名" description="岗位可能已结束或不在当前账号范围内，请返回列表重新选择。" actionText="返回岗位列表" onAction={() => void Taro.reLaunch({ url: "/pages/jobs/index/index" })} />;

  return (
    <AsyncBoundary
      loading={jobs.loading || (source === "OPERATOR" && projects.loading)}
      error={jobs.error ?? (source === "OPERATOR" ? projects.error : null)}
      onRetry={() => {
        void projects.reload();
        void jobs.reload();
      }}
    >
      {publicMode ? <SectionCard title="微信登录后报名，更方便查进度"><Text className="muted">首次本人报名会绑定新档案。已经匿名报过名的工友，需要负责人核实后绑定本人账号。</Text><Button className="button button--secondary" disabled={submitting} onClick={() => void Taro.navigateTo({ url: `${loginPath(applicationFormPath(initialJobId, referralToken))}&method=wechat` })}>微信登录后继续报名</Button><Text className="muted">也可以直接在下方匿名报名。</Text></SectionCard> : null}
      {fixedJob && selectedJob ? <SectionCard title="你选择的岗位"><Text className="card-title">{selectedJob.title}</Text><RecruitmentSalary salary={selectedJob.salary} /><Text className="card-meta">{selectedJob.workLocation}</Text></SectionCard> : null}
      <SectionCard title={ownApplication ? "确认本人报名" : source === "REFERRAL" ? "填写被推荐人信息" : "填写报名信息"}>
        {ownApplication ? <><Text className="card-title">{account?.displayName}</Text><Text className="muted">使用当前账号已绑定的本人档案报名，无需重复填写姓名和身份证。</Text></> : <>
        <FormField label="姓名" required>
          <TextField value={form.name} placeholder="请输入真实姓名" onChange={(value) => update("name", value)} maxlength={64} />
        </FormField>
        <FormField label="手机号" required>
          <TextField value={form.phone} placeholder="请输入 11 位手机号" type="number" onChange={(value) => update("phone", value)} maxlength={11} />
        </FormField>
        <FormField label="身份证号" required hint="用于核对本人身份和避免重复建档，仅向办理报名的授权人员展示。">
          <TextField value={form.idCard} placeholder="请输入身份证号" type="idcard" onChange={(value) => update("idCard", value)} maxlength={18} />
        </FormField></>}
        {!fixedJob ? <><FormField label="项目" required>
          <SelectField
            value={form.projectId}
            options={projectOptions}
            placeholder="请选择项目"
            onChange={(value) => setForm((current) => ({ ...current, projectId: value, jobDemandId: null, jobTitle: "" }))}
          />
        </FormField>
        <FormField label="招聘岗位" required={source !== "OPERATOR"} hint={source === "OPERATOR" ? "无已发布岗位时可填写岗位名称。" : "岗位与项目、政策和负责人自动关联。"}>
          {jobOptions.length ? (
            <SelectField value={form.jobDemandId ?? ""} options={jobOptions} placeholder="请选择招聘岗位" onChange={selectJob} />
          ) : (
            <TextField value={form.jobTitle} placeholder="当前项目无开放岗位，请填写岗位" onChange={(value) => update("jobTitle", value)} />
          )}
        </FormField></> : null}
        {source === "OPERATOR" ? (
          <FormField label="面试日期">
            <DateField value={form.interviewDate ?? ""} onChange={(value) => update("interviewDate", value)} />
          </FormField>
        ) : null}
      </SectionCard>
      {!ownApplication ? <View className="registration-optional-toggle" ariaRole="button" ariaLabel={showOptional ? "收起补充信息" : "展开选填信息"} onClick={() => setShowOptional(!showOptional)}><Text>补充信息（选填）</Text><Text>{showOptional ? "收起 −" : "展开 +"}</Text></View> : null}
      {showOptional && !ownApplication ? <SectionCard title="紧急联系人与备注">
        <FormField label="姓名">
          <TextField value={form.emergencyContactName ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactName", value)} maxlength={64} />
        </FormField>
        <FormField label="联系方式">
          <TextField value={form.emergencyContactPhone ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactPhone", value)} maxlength={32} />
        </FormField>
        <FormField label="与本人关系">
          <TextField value={form.emergencyContactRelation ?? ""} placeholder="缺失可暂时留空" onChange={(value) => update("emergencyContactRelation", value)} maxlength={32} />
        </FormField>
        <FormField label="备注">
          <TextAreaField value={form.notes ?? ""} placeholder="记录必要的特殊情况，不编造缺失信息" onChange={(value) => update("notes", value)} />
        </FormField>
      </SectionCard> : null}
      {needsConsent ? <View className="registration-consent"><CheckboxGroup onChange={(event) => setConsent(event.detail.value.includes("consent"))}><Label className="registration-consent__choice"><Checkbox value="consent" checked={consent} color="#0071e3" /><Text>{source === "REFERRAL" ? "我已取得被推荐人的知情同意，并同意" : "我已阅读并同意"}</Text></Label></CheckboxGroup><Text className="link-text" onClick={() => void Taro.navigateTo({ url: "/pages/policy/index" })}>《报名服务与隐私说明》</Text></View> : null}
      <Button className="button recruitment-submit" loading={submitting} disabled={submitting || Boolean(initialJobId && (!initialJob || !selectedJob))} onClick={() => void submit()}>{ownApplication ? "确认本人报名" : submitText}</Button>
      <Text className="muted">
        {publicMode
          ? "匿名提交后，需负责人核实并绑定本人账号才可查询进度。"
          : source === "REFERRAL" ? "推荐关系按你的登录身份记录，请填写真实信息。" : "请保持电话畅通，留意岗位负责人联系。"}
      </Text>
    </AsyncBoundary>
  );
}
