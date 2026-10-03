import { Image } from "@tarojs/components";
import jobs from "../assets/recruitment/jobs.png";
import jobsActive from "../assets/recruitment/jobs-active.png";
import applications from "../assets/recruitment/applications.png";
import applicationsActive from "../assets/recruitment/applications-active.png";
import referrals from "../assets/recruitment/referrals.png";
import referralsActive from "../assets/recruitment/referrals-active.png";
import profile from "../assets/recruitment/profile.png";
import profileActive from "../assets/recruitment/profile-active.png";
import factory from "../assets/recruitment/factory-active.png";
import warehouse from "../assets/recruitment/warehouse-active.png";
import wrench from "../assets/recruitment/wrench-active.png";
import truck from "../assets/recruitment/truck-active.png";
import search from "../assets/recruitment/search.png";
import location from "../assets/recruitment/location.png";
import company from "../assets/recruitment/company.png";

const icons = {
  jobs: [jobs, jobsActive], applications: [applications, applicationsActive],
  referrals: [referrals, referralsActive], profile: [profile, profileActive],
  factory: [factory, factory], warehouse: [warehouse, warehouse], wrench: [wrench, wrench],
  truck: [truck, truck], search: [search, search], location: [location, location], company: [company, company]
} satisfies Record<string, [string, string]>;

export function RecruitmentIcon({ name, active = false }: { name: keyof typeof icons; active?: boolean }) {
  return <Image className="recruitment-icon" src={icons[name][active ? 1 : 0]} mode="aspectFit" ariaLabel="" />;
}
