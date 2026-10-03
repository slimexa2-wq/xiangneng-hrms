import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { MemoryRouter } from "react-router-dom";
import { Permission, RewardStatus } from "@xiangneng/shared";
import { ReferralRewardsPage } from "./ReferralRewardsPage";

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), permissions: new Set<string>() }));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ can: (permission: string) => mocks.permissions.has(permission) }) }));
vi.mock("../lib/api", () => ({ api: { get: mocks.get, patch: mocks.patch }, getErrorMessage: (error: unknown) => String(error) }));

function showReward(status: RewardStatus) {
  mocks.get.mockResolvedValue({
    items: [{ id: "reward-1", amount: 600, status, createdAt: "2026-01-01T00:00:00Z", approvedAt: "2026-01-03T00:00:00Z", eligibility: { eligible: true, retentionDays: 30, eligibleAt: "2026-01-01T00:00:00Z", reason: "已满约定的在岗期限" }, referral: { person: { id: "person-1", name: "王师傅", phone: "13800000000", status: "ACTIVE", onboardDate: "2025-12-01T00:00:00Z" }, recommender: { displayName: "李师傅" }, policySnapshot: { name: "厂区推荐规则", version: 1, retentionDays: 30, achievementConditions: "考勤确认" } } }],
    pagination: { page: 1, pageSize: 20, total: 1 }
  });
  return render(<ConfigProvider theme={{ token: { motion: false } }}><App><MemoryRouter><ReferralRewardsPage /></MemoryRouter></App></ConfigProvider>);
}

describe("推荐奖励审核与实际付款登记", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.clear();
    mocks.permissions.add(Permission.REWARD_READ);
    mocks.patch.mockResolvedValue({});
  }, 10000);

  it("达成核实账号看不到财务审批和发放动作", async () => {
    mocks.permissions.add(Permission.REWARD_REVIEW);
    showReward(RewardStatus.ACHIEVED);
    await screen.findByText("王师傅");
    expect(screen.queryByText("财务审批")).not.toBeInTheDocument();
    expect(screen.queryByText("登记发放")).not.toBeInTheDocument();
  }, 10000);

  it("出纳可以查看待达成奖励但不能核实达成或取消", async () => {
    mocks.permissions.add(Permission.REWARD_PAY);
    showReward(RewardStatus.PENDING);
    await screen.findByText("王师傅");
    expect(screen.queryByText("核实达成")).not.toBeInTheDocument();
    expect(screen.queryByText(/^取\s*消$/)).not.toBeInTheDocument();
  });

  it("付款登记必须填写真实流水和凭证", async () => {
    mocks.permissions.add(Permission.REWARD_PAY);
    showReward(RewardStatus.APPROVED);
    fireEvent.click(await screen.findByText("登记发放"));
    fireEvent.change(screen.getByLabelText("发放说明"), { target: { value: "本人已收款" } });
    fireEvent.click(screen.getByText("保存付款记录"));
    await screen.findByText("请输入付款流水号", {}, { timeout: 5000 });
    expect(mocks.patch).not.toHaveBeenCalled();
  }, 10000);

  it("保存完整付款记录，使用专属发放状态而不是跳过审批", async () => {
    mocks.permissions.add(Permission.REWARD_PAY);
    showReward(RewardStatus.APPROVED);
    fireEvent.click(await screen.findByText("登记发放"));
    fireEvent.change(screen.getByLabelText("实际付款流水号"), { target: { value: "BANK-REAL-001" } });
    fireEvent.change(screen.getByLabelText("付款凭证"), { target: { value: "财务归档凭证 2026-001，收款人已核对" } });
    fireEvent.change(screen.getByLabelText("发放说明"), { target: { value: "本人已收款" } });
    fireEvent.click(screen.getByText("保存付款记录"));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/referral-rewards/reward-1", expect.objectContaining({ status: RewardStatus.PAID, notes: "本人已收款", payment: expect.objectContaining({ reference: "BANK-REAL-001", proof: "财务归档凭证 2026-001，收款人已核对", paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }) })), { timeout: 5000 });
  }, 10000);

  it("已发放记录仅保留查看入口", async () => {
    mocks.permissions.add(Permission.REWARD_PAY);
    mocks.permissions.add(Permission.REWARD_APPROVE);
    showReward(RewardStatus.PAID);
    await screen.findByText("王师傅");
    expect(screen.queryByText(/^(登记发放|核实达成|财务审批|取消)$/)).not.toBeInTheDocument();
    expect(screen.getByText(/详\s*情/)).toBeInTheDocument();
  });
});
