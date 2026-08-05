import { AiAssistanceNotice } from "../components/ai-assistance-notice";
import { PolicyLayout } from "../components/policy-layout";
import { readPublicComplianceConfig } from "../lib/compliance/config";

export const dynamic = "force-dynamic";

export default function AiDisclosurePage() {
  const config = readPublicComplianceConfig();
  return (
    <PolicyLayout
      title="AI 服务与模型信息公示"
      eyebrow="透明度说明"
      description="说明产品中 AI 的用途、当前配置的服务类别、已知局限和内容标识范围。"
      config={config}
    >
      <AiAssistanceNotice />
      <section><h2>1. AI 服务用途</h2><p>AI 用于分析求职练习回答、生成追问和表达建议，解析简历与岗位材料，建立事实台账，形成岗位匹配规划，辅助改写简历，以及把用户主动提交的语音转换为文字。</p></section>
      <section><h2>2. 服务商与模型</h2><dl className="policy-data-list"><div><dt>聊天及材料解析服务商</dt><dd>{config.aiProviderName}</dd></div><div><dt>聊天模型</dt><dd>{config.chatModelName}</dd></div><div><dt>语音识别服务商</dt><dd>{config.asrProviderName}</dd></div><div><dt>语音识别模型</dt><dd>{config.asrModelName}</dd></div><div><dt>模型备案或登记信息</dt><dd>{config.modelFilingInfo}</dd></div></dl><p>上述信息由服务端公开配置提供，不从密钥或内部连接配置推断。显示“待运营方确认”时，不应将当前版本作为正式上线公示。</p></section>
      <section><h2>3. 数据发送提示</h2><p>使用聊天、材料解析或语音功能时，相关文本、文件或音频会经应用服务器发送给对应模型服务商处理。请在提交前去除手机号、邮箱、身份证号码、公司机密及其他不必要的敏感信息。服务商所在地、保存期限、训练使用设置和委托处理安排仍需运营方依据实际合同确认。</p></section>
      <section><h2>4. 输出局限</h2><p>AI 输出可能包含错误、遗漏、偏差、过时信息或不适合目标岗位的建议。简历中的经历、日期、指标、学历和证书必须由用户人工核验；没有证据的数据不应写入最终简历。产品输出不构成录用承诺、法律意见或职业资格判断。</p></section>
      <section><h2>5. 当前标识方式</h2><p>四个工作区在界面中展示统一显式提示：“AI 辅助生成，仅供求职练习，请人工核验。”当前实现不代表已经满足所有文件元数据或隐式标识要求。PDF、DOCX、复制文本和其他导出场景的标识范围记录在项目技术审计中，需结合实际服务形态由专业顾问确认。</p></section>
      <section><h2>6. 官方规则参考</h2><ul><li><a href="https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm" target="_blank" rel="noreferrer">《生成式人工智能服务管理暂行办法》</a></li><li><a href="https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm" target="_blank" rel="noreferrer">《人工智能生成合成内容标识办法》</a></li><li><a href="https://flk.npc.gov.cn/detail?fileId=&id=ff8081817b6472a3017b656cc2040044&title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E4%B8%AA%E4%BA%BA%E4%BF%A1%E6%81%AF%E4%BF%9D%E6%8A%A4%E6%B3%95&type=" target="_blank" rel="noreferrer">《中华人民共和国个人信息保护法》</a></li></ul><p>是否适用备案、安全评估、生成合成内容标识或其他程序，应由属地主管部门或专业顾问根据实际运营方式确认。</p></section>
    </PolicyLayout>
  );
}
