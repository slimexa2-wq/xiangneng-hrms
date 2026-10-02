import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, jsonBody } from '../../app/api';
import type { Job } from '../../app/types';
import { SalaryLabel } from '../../components/DataCards';
import { useSession } from '../../app/session';
import { Modal } from '../../components/Ui';

export function ApplyDialog({ job, onClose, referralToken }: { job: Job | null; onClose: () => void; referralToken?: string }) {
  const [consent, setConsent] = useState(false);
  const queryClient = useQueryClient();
  const { session } = useSession();
  const apply = useMutation({
    mutationFn: () => api(`/api/jobs/${job!.id}/apply`, { method: 'POST', ...jsonBody({ consent: true, ...(referralToken ? { referralToken } : {}) }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['my-person'] }),
        queryClient.invalidateQueries({ queryKey: ['my-applications'] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
      ]);
    }
  });
  useEffect(() => { setConsent(false); apply.reset(); }, [job?.id]);
  return <Modal open={Boolean(job)} title={apply.isSuccess ? '报名成功' : '确认报名'} onClose={() => { if (!apply.isPending) onClose(); }} footer={apply.isSuccess ? <Link className="primary-button" to="/personal/me/applications" onClick={onClose}>查看我的报名</Link> : <button className="primary-button" type="button" disabled={!consent || apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? '正在提交…' : '确认报名'}</button>}>
    {apply.isSuccess ? <div className="success-state" role="status"><Check /><strong>已收到你的报名</strong><p>可在“我的报名”查看进度和面试安排。</p></div> : <div className="apply-summary">
      <h3>{job?.title}</h3>{job && <SalaryLabel job={job} />}<p>{job?.projectName}</p><p><MapPin size={16} />{job?.address || job?.region}</p>
      <div className="apply-profile"><span>报名人</span><strong>{session?.name}</strong><span>使用你在 HRMS 中已有的人员档案，无需重复填写简历。</span></div>
      <label className="recruit-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我同意将报名资料提供给该岗位的招聘负责人，用于联系、面试和入职安排。</span></label>
      <p className="recruit-safe-note">报名不收取费用。岗位工资、吃住费用及合同主体请在入职前向负责人确认。</p>
      {apply.error && <p className="form-error" role="alert">{apply.error.message}，可重试或电话联系。</p>}
    </div>}
  </Modal>;
}
