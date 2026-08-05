import { PolicyLayout } from "../components/policy-layout";
import { readPublicComplianceConfig } from "../lib/compliance/config";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const config = readPublicComplianceConfig();
  return (
    <PolicyLayout
      title="用户协议"
      eyebrow="服务使用规则"
      description="请在进入封闭测试前阅读本协议，了解 AI 求职练习工具的适用范围、使用责任和服务限制。"
      config={config}
    >
      <section><h2>1. 服务定位</h2><p>Interview Studio 是由“{config.operatorName}”提供的求职练习与简历辅助工具，包含简历事实整理、岗位定制改写、文字练习、模拟面试、定制面试和语音转写等功能。产品不提供录用保证，也不替代职业顾问、律师或用人单位的专业判断。</p></section>
      <section><h2>2. AI 输出与人工核验</h2><p>产品中的追问、建议、总结和简历改写可能由 AI 生成或辅助生成，仅供求职练习参考。AI 可能出现事实偏差、遗漏、过时信息或不适合具体岗位的表达。你应核对经历、日期、职责、指标和结论，并对最终提交、发布或用于面试的材料负责。</p><p>界面使用“AI 辅助生成，仅供求职练习，请人工核验”作为当前显式提示。导出文件的显式和隐式标识仍在技术与专业确认范围内；请勿删除、篡改依法需要保留的 AI 内容标识。</p></section>
      <section><h2>3. 用户行为规范</h2><p>你应确保提交材料来源合法，并且不得：</p><ul><li>上传违法、有害、歧视、暴力、淫秽或侵犯他人合法权益的内容；</li><li>上传他人隐私、身份证完整号码、账号密钥、公司商业秘密或未公开内部材料；</li><li>利用产品伪造履历、项目、学历、证书、数据或工作结果；</li><li>绕过邀请码、访问控制、限流、费用熔断或其他安全措施；</li><li>以自动化手段干扰产品运行，或将服务用于违法用途。</li></ul></section>
      <section><h2>4. 知识产权</h2><p>你保留对合法上传材料享有的权利，并保证有权将其用于本服务。产品软件、界面、品牌和自有方法论的权利归其相应权利人所有。AI 输出是否具备以及如何行使相关权利，可能受内容、使用方式、模型服务条款和适用规则影响，使用前请自行核验。</p></section>
      <section><h2>5. 服务限制、暂停与终止</h2><p>封闭 Beta 可能设置邀请码有效期、使用次数、分钟限流、每日配额、并发上限和预算熔断。系统维护、第三方模型异常、Redis 故障、安全风险或违反本协议时，服务可能被限制、暂停或终止。我们会尽量提供可理解的状态提示，但不承诺服务持续无中断。</p></section>
      <section><h2>6. 责任边界</h2><p>求职决策、简历投递、面试表达和材料发布均由你自主完成。对于因未核验 AI 输出、上传无权使用的资料、违反用人单位规则或将练习建议直接用于高风险场景产生的后果，应根据实际事实和适用规则确定责任。本条不排除依法不能限制或免除的责任。</p></section>
      <section><h2>7. 投诉举报与争议联系</h2><p>如需反馈个人信息、内容安全、知识产权或服务争议，请通过<a href="/rights">个人信息权利与投诉入口</a>联系。邮箱：{config.contactEmail}；预计反馈时限：{config.complaintResponseDays ? `${config.complaintResponseDays} 个自然日内` : "待运营方确认"}。该时限为运营配置，不代表对法定期限作出额外承诺。</p></section>
      <section><h2>8. 协议更新</h2><p>协议版本发生变化时，受保护工作区会要求你重新确认当前版本。继续使用前请重新阅读更新内容。</p></section>
    </PolicyLayout>
  );
}
