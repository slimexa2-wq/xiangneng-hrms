import { Text } from "@tarojs/components";
import { PageShell, SectionCard } from "../../components/ui";

export default function RegistrationPolicyPage() {
  return (
    <PageShell title="报名服务与隐私说明" subtitle="请阅读后再决定是否提交报名" className="recruitment-shell">
      <SectionCard title="报名服务">
        <Text className="recruitment-body-text">好工到为四川省内工友提供岗位信息和报名服务。提交报名代表你愿意由该岗位负责人就求职、面试和入职安排联系你，不代表已录用。工资构成、结算方式、工作时间、吃住费用、合同主体及保险安排，请在入职前与招聘方确认。</Text>
      </SectionCard>
      <SectionCard title="收集什么信息">
        <Text className="recruitment-body-text">报名需要姓名、手机号和身份证号。姓名和手机号用于联系，身份证号用于核对身份及避免重复建档；非必填的紧急联系人和备注可留空。页面会把你主动填写的信息提交至祥能 HRMS 系统，由具备岗位业务权限的人员办理。</Text>
      </SectionCard>
      <SectionCard title="如何处理和保护信息">
        <Text className="recruitment-body-text">系统按账号角色和项目范围限制访问。求职者只能查看本人报名，供应商只能查看授权范围内的人员，内部员工只能查看本人推荐和奖励。请勿填写与本次报名无关的敏感信息。若需更正信息、咨询信息使用或申请删除，请通过岗位详情中的项目负责人联系服务方。</Text>
      </SectionCard>
      <SectionCard title="推荐报名和奖励">
        <Text className="recruitment-body-text">替他人推荐报名时，应先获得被推荐人的知情同意。推荐关系通过你的账号和官方推荐链接记录，仅按一次直接推荐处理。奖励对象、金额、在职期限及不计奖情形以岗位公示的有效政策为准；需要达成条件并审核，发放状态以实际付款记录为准。</Text>
      </SectionCard>
      <Text className="recruitment-service-note">如对岗位或报名服务有疑问，请通过该岗位公示的负责人联系方式咨询后再提交。</Text>
    </PageShell>
  );
}
