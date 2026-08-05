import { PolicyLayout } from "../components/policy-layout";
import { readPublicComplianceConfig } from "../lib/compliance/config";
import { RightsClient } from "./rights-client";

export const dynamic = "force-dynamic";

export default function RightsPage() {
  const config = readPublicComplianceConfig();
  return (
    <PolicyLayout title="个人信息权利与投诉入口" eyebrow="你的数据由你管理" description="在本机清除业务数据，了解服务器数据边界，或通过本机邮件应用提交结构化请求。" config={config}>
      <RightsClient contactEmail={config.contactEmail} responseDays={config.complaintResponseDays} />
      <section><h2>服务器数据说明</h2><p>服务器会话同步当前默认关闭。现有同步接口只依赖浏览器生成的 client_id，没有正式账号或可靠的所有权验证，因此我们不会新增“凭 client_id 删除服务器文件”的不安全接口。生产合规检查会阻止开启同步。</p><p>若测试环境曾经手动开启同步，或你需要处理邀请码/Beta 会话等服务器记录，请通过上方联系渠道说明大致使用时间和功能。运营方需要在不额外索取不必要敏感信息的前提下核验和处理。安全的服务器同步、账号归属和自助删除机制属于后续任务。</p></section>
      <section><h2>处理流程</h2><ol><li>邮件进入配置的联系邮箱；</li><li>运营方确认请求类型、必要范围及可行的身份核验方式；</li><li>根据实际数据位置执行查阅、更正、删除、撤回同意或投诉处理；</li><li>在配置的反馈时限内回复进展或结果。复杂情况按适用规则另行说明。</li></ol><p>请勿在邮件中发送身份证完整号码、金融账号、账号密钥、未公开公司文件或与请求无关的敏感信息。</p></section>
    </PolicyLayout>
  );
}
