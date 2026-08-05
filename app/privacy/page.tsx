import { PolicyLayout } from "../components/policy-layout";
import { readPublicComplianceConfig } from "../lib/compliance/config";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const config = readPublicComplianceConfig();
  return (
    <PolicyLayout
      title="隐私政策"
      eyebrow="数据使用说明"
      description="说明 Interview Studio 当前如何处理简历、岗位材料、练习回答、语音和封闭测试数据。"
      config={config}
    >
      <section>
        <h2>1. 适用范围与运营方</h2>
        <p>本政策适用于 Interview Studio 的简历工作台、文字练习、模拟面试、定制面试及封闭测试访问功能。当前运营主体为“{config.operatorName}”。如页面显示“待运营方确认”，表示该信息尚未完成上线配置，当前页面仅供上线前审阅。</p>
        <p>这些页面和技术措施是产品事实说明，不构成法律意见，也不代表产品已经完成全部监管程序。</p>
      </section>

      <section>
        <h2>2. 我们处理的信息与目的</h2>
        <ul>
          <li><strong>简历、岗位 JD 与上传文件：</strong>用于解析材料、建立事实台账、生成岗位匹配规划和改写建议。</li>
          <li><strong>文字回答、面试问题与反馈：</strong>用于生成追问、表达建议、模拟面试和练习总结。</li>
          <li><strong>语音与转写文本：</strong>仅在你主动录音并提交后，用于把回答转换为文字并继续练习。</li>
          <li><strong>邀请码与 Beta 会话：</strong>用于控制封闭测试访问。邀请码和会话令牌在服务端以哈希形式保存，浏览器 Cookie 保存不透明会话令牌。</li>
          <li><strong>客户端业务标识：</strong>仅在服务器会话同步功能开启时用于区分浏览器；该功能当前默认关闭。</li>
          <li><strong>运行与费用指标：</strong>用于限流、费用熔断、故障排查和脱敏聚合统计，不包含简历、JD、回答、语音或转写全文。</li>
        </ul>
      </section>

      <section>
        <h2>3. 浏览器本地存储与服务器处理</h2>
        <p>面试历史、定制面试材料、简历工作台草稿和客户端业务标识默认保存在当前浏览器的 localStorage 中。它们不会因为关闭页面自动删除，可通过“个人信息权利”页面清除，或随浏览器站点数据一起移除。</p>
        <p>聊天模型、文件解析和语音转写请求需要经过服务器处理。服务器会在请求期间接收相关材料并转发给已配置的模型服务商。当前代码不会把上传文件单独写入应用磁盘；但第三方模型服务的处理和保存规则仍需依据实际采购合同、服务区域与供应商条款由运营方确认。</p>
        <p>服务器会话同步当前默认关闭。若未来开启，模拟面试和定制面试的完整会话会按客户端标识写入服务器文件；在建立可靠的所有权验证和删除机制前，生产合规检查会阻止开启该功能。</p>
      </section>

      <section>
        <h2>4. 第三方服务</h2>
        <p>聊天与材料解析服务商：{config.aiProviderName}；模型：{config.chatModelName}。语音识别服务商：{config.asrProviderName}；模型：{config.asrModelName}。</p>
        <p>当你使用对应功能时，所提交的文本、文件或语音会发送至上述服务类别。上线前，运营方仍需确认实际服务商、模型名称、服务器区域、委托处理条款、供应商保存期限及是否涉及跨境提供。</p>
      </section>

      <section>
        <h2>5. 保存期限与删除</h2>
        <ul>
          <li>浏览器业务数据：保存到你主动清除、本浏览器清理站点数据或浏览器环境被移除时。</li>
          <li>Beta 会话：默认有效期由服务端配置，当前部署模板为 14 天；退出、过期或关联邀请码撤销后失效。</li>
          <li>限流与配额计数：按分钟、上海自然日或自然月设置 Redis TTL，到期自动清理。</li>
          <li>脱敏聚合指标：部署模板中小时指标为 168 小时、日指标为 90 天，可由服务端配置调整。</li>
          <li>管理员会话：部署模板中为 8 小时，退出、撤销或到期后失效。</li>
          <li>运行日志：生产 Compose 使用大小轮转限制，但尚未承诺固定天数，最终保存期限需运营方确认。</li>
          <li>邀请码状态记录：当前用于审计和撤销，代码未设置自动删除期限，需运营方确定保留与清理规则。</li>
        </ul>
      </section>

      <section>
        <h2>6. 日志、匿名指标与安全措施</h2>
        <p>应用日志使用固定字段白名单，记录请求编号、接口类别、模型标识、状态码类别、耗时、费用单位和流状态等运行信息。IP 与活跃会话标识会经过服务端 HMAC 处理后用于限流或聚合，不记录原始 IP、邀请码、Cookie、会话令牌或用户材料全文。</p>
        <p>我们采用 HttpOnly 会话 Cookie、Redis 原子限流、费用熔断、服务端鉴权和日志脱敏等措施降低风险，但任何网络服务都无法保证绝对安全或永不中断。</p>
      </section>

      <section>
        <h2>7. 你的权利与联系渠道</h2>
        <p>你可以申请查阅、更正、删除相关个人信息，撤回同意，或提出投诉举报。请前往<a href="/rights">个人信息权利页面</a>查看本机清除操作和联系流程。联系邮箱：{config.contactEmail}；预计反馈时限：{config.complaintResponseDays ? `${config.complaintResponseDays} 个自然日内` : "待运营方确认"}。</p>
      </section>

      <section>
        <h2>8. 未成年人和敏感信息提示</h2>
        <p>产品面向大学生和职场新人，不以不满十四周岁的未成年人为主要服务对象。未成年人使用前应在监护人指导下阅读相关说明。请勿上传身份证完整号码、金融账户、医疗健康信息、生物识别信息、他人隐私、未公开公司材料或其他与求职练习无关的敏感信息。</p>
      </section>

      <section>
        <h2>9. 政策更新</h2>
        <p>当处理目的、信息类型、第三方服务或政策版本发生重要变化时，我们会更新本页面。政策版本变化后，现有 Beta 会话需要重新确认当前版本，确认完成前不能继续使用受保护工作区。</p>
      </section>
    </PolicyLayout>
  );
}
