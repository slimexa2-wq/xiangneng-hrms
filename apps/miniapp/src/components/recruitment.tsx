import Taro from "@tarojs/taro";
import { Button, Input, Text, View } from "@tarojs/components";
import type { JobDemand, SessionUser } from "../api/types";
import { formatMoney, projectName } from "../domain/format";
import { applicationFormPath, jobDetailPath } from "../domain/links";
import { recruitmentCategories, recruitmentCities, rewardCondition } from "../domain/recruitment";
import { RecruitmentIcon } from "./recruitment-icon";

type CandidateTab = "jobs" | "applications" | "referrals" | "profile";

export function CandidateNavigation({ active, user }: { active: CandidateTab; user?: SessionUser | null }) {
  const items = [
    { key: "jobs", label: "找工作", path: "/pages/jobs/index/index" },
    { key: "applications", label: "我的报名", path: "/pages/application/mine/index" },
    { key: "referrals", label: "推荐有奖", path: "/pages/referrals/index/index" },
    { key: "profile", label: "我的", path: "/pages/profile/index/index" }
  ];
  return (
    <View className="candidate-navigation">
      {items.map((item) => (
        <View key={item.key} ariaRole="button" ariaLabel={`${item.label}${active === item.key ? "，当前页面" : ""}`} className={`candidate-navigation__item ${active === item.key ? "candidate-navigation__item--active" : ""}`} onClick={() => {
          if (active !== item.key) void Taro.reLaunch({ url: item.path });
        }}>
          <RecruitmentIcon name={item.key as CandidateTab} active={active === item.key} /><Text>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function RecruitmentFilters({ keyword, city, category, benefit = "", onKeyword, onCity, onCategory, onBenefit }: {
  keyword: string;
  city: string;
  category: string;
  benefit?: string;
  onKeyword: (value: string) => void;
  onCity: (value: string) => void;
  onCategory: (value: string) => void;
  onBenefit?: (value: string) => void;
}) {
  return (
    <View className="recruitment-filters">
      <View className="recruitment-search">
        <RecruitmentIcon name="search" />
        <Input value={keyword} placeholder="搜岗位、工厂或工作地点" ariaLabel="搜索岗位、工厂或工作地点" className="recruitment-search__input" onInput={(event) => onKeyword(event.detail.value)} confirmType="search" />
        {keyword ? <Text className="recruitment-search__clear" onClick={() => onKeyword("")}>清空</Text> : null}
      </View>
      <View className="recruitment-categories">
        {recruitmentCategories.map((item, index) => (
          <View key={item} ariaRole="button" ariaLabel={`${item}${category === item ? "，已选择" : ""}`} className={`recruitment-category ${category === item ? "recruitment-category--active" : ""}`} onClick={() => onCategory(item)}><View className={`recruitment-category__icon recruitment-category__icon--${index}`}><RecruitmentIcon name={(["jobs", "factory", "warehouse", "wrench", "truck"] as const)[index] ?? "jobs"} active /></View><Text>{item === "全部工种" ? "全部岗位" : item === "普工" ? "工厂普工" : item}</Text></View>
        ))}
      </View>
      <View className="recruitment-filter-row">
        {recruitmentCities.map((item) => (
          <View key={item} ariaRole="button" ariaLabel={`${item}${city === item ? "，已选择" : ""}`} className={`recruitment-chip ${city === item ? "recruitment-chip--active" : ""}`} onClick={() => onCity(item)}><Text>{item}</Text></View>
        ))}
      </View>
      {onBenefit ? <View className="recruitment-benefit-filters">{["包吃", "包住", "长白班"].map((item) => <View key={item} ariaRole="button" ariaLabel={`${item}${benefit === item ? "，已选择" : ""}`} className={`recruitment-benefit-filter ${benefit === item ? "recruitment-benefit-filter--active" : ""}`} onClick={() => onBenefit(benefit === item ? "" : item)}><Text>{item}</Text></View>)}<Text className="recruitment-benefit-hint">按实际待遇筛选</Text></View> : null}
    </View>
  );
}

export function RecruitmentSalary({ salary }: { salary: string }) {
  const matched = salary.match(/^(.*?)(元\s*[\/／]\s*(?:小时|月|天|日|年|周|时))(.*)$/);
  const compact = matched && /^[\d,\s.\-–—~至]+$/.test(matched[1] ?? "");
  return <View className={`recruitment-salary${compact ? "" : " recruitment-salary--description"}`}><Text className="recruitment-salary__amount">{matched ? matched[1] : salary || "薪资待确认"}</Text>{matched ? <Text className="recruitment-salary__unit">{matched[2]}</Text> : null}{matched?.[3] ? <Text className="recruitment-salary__note">{matched[3]}</Text> : null}</View>;
}

export function RecruitmentJobCard({ job, actionLabel = "立即报名", showReward = false, canApply = true, referral = false }: { job: JobDemand; actionLabel?: string; showReward?: boolean; canApply?: boolean; referral?: boolean }) {
  const navigate = () => void Taro.navigateTo({ url: jobDetailPath(job.id) });
  const apply = () => void Taro.navigateTo({ url: applicationFormPath(job.id, undefined, referral ? "referral" : undefined) });
  return (
    <View className="recruitment-job" ariaRole="button" ariaLabel={`${job.title}，${job.salary}，${job.workLocation}，查看详情`} onClick={navigate}>
      <View className="recruitment-job__heading"><Text className="recruitment-job__title">{job.title}</Text><Text className="recruitment-job__status">{job.status === "RECRUITING" ? "正在招聘" : "暂停报名"}</Text></View>
      <RecruitmentSalary salary={job.salary} />
      <View className="recruitment-job__location"><RecruitmentIcon name="location" /><Text>{[job.workLocation || "工作地点待确认", job.workTime].filter(Boolean).join(" · ")}</Text></View>
      {job.benefits?.length ? <View className="recruitment-job__benefits">{job.benefits.slice(0, 3).map((item) => <Text className="recruitment-job__tag" key={item}>{item}</Text>)}</View> : null}
      <View className="recruitment-job__company"><View className="recruitment-company-icon"><RecruitmentIcon name="company" /></View><Text>{projectName(job)}</Text><Text className="recruitment-chevron">›</Text></View>
      {showReward && job.referralOffer ? (
        <View className="recruitment-job__reward">
          <Text>推荐奖励 {formatMoney(job.referralOffer.amount)} / 人</Text>
          <Text className="recruitment-job__reward-condition">{rewardCondition(job)}</Text>
        </View>
      ) : null}
      <View className="recruitment-job__footer"><Text className="recruitment-job__details" onClick={(event) => { event.stopPropagation(); navigate(); }}>查看详情 ›</Text><Button className="button recruitment-job__button" disabled={!canApply} onClick={(event) => { event.stopPropagation(); apply(); }}>{canApply ? actionLabel : "仅可查看"}</Button></View>
    </View>
  );
}

export function ReferralOfferCard({ job }: { job: JobDemand }) {
  const offer = job.referralOffer;
  if (!offer) return null;
  return (
    <View className="referral-offer">
      <Text className="referral-offer__eyebrow">一次直接推荐 · 奖励条件先看清</Text>
      <Text className="referral-offer__amount">{formatMoney(offer.amount)}<Text className="referral-offer__unit"> / 人</Text></Text>
      <Text className="referral-offer__condition">{rewardCondition(job)}</Text>
      <Text className="referral-offer__rule">奖励对象：{offer.employeeType || "符合该岗位推荐政策的员工"}</Text>
      <Text className="referral-offer__rule">达成条件：{offer.achievementConditions}</Text>
      {offer.exclusionConditions ? <Text className="referral-offer__rule">不计奖情形：{offer.exclusionConditions}</Text> : null}
      <Text className="referral-offer__footnote">直接推荐关系由系统记录。审核通过后按实际付款进度展示，不承诺报名即到账。</Text>
    </View>
  );
}
