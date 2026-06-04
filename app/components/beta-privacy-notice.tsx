"use client";

type BetaPrivacyNoticeProps = {
  mode: "text" | "mock" | "custom";
};

const copyByMode: Record<BetaPrivacyNoticeProps["mode"], string> = {
  text: "Beta 试用中：你的回答会发送给 AI 服务做追问和整理。请尽量不要输入身份证号、住址、公司机密或未公开数据。",
  mock: "Beta 试用中：语音会先转写再进入面试追问。请只使用你愿意用于练习的真实信息，不要口述敏感个人信息或公司机密。",
  custom:
    "Beta 试用中：你粘贴或上传的简历、JD 和回答会用于岗位练习生成。请先去掉手机号、邮箱、身份证号和未公开业务数据。"
};

export function BetaPrivacyNotice({ mode }: BetaPrivacyNoticeProps) {
  return (
    <section className="beta-notice" aria-label="Beta 隐私提示">
      <div className="beta-notice-badge">Beta</div>
      <div className="beta-notice-copy">
        <p>{copyByMode[mode]}</p>
        <p>历史记录默认保存在当前浏览器，本地清空浏览器数据后会一并移除。服务器会话同步默认关闭。</p>
      </div>
    </section>
  );
}
