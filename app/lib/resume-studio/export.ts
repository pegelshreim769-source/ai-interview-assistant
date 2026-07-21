import type { FinalResume } from "./types";

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48) || "岗位定制简历";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function resumeExportBaseName(resume: FinalResume) {
  return safeFileName(`${resume.target_title || "岗位定制"}-简历`);
}

export async function downloadResumeDocx(resume: FinalResume) {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun
  } = await import("docx");

  const sectionHeading = (text: string) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, bold: true, color: "1F2E48", size: 26 })]
  });
  const bodyParagraph = (text: string) => new Paragraph({
    spacing: { after: 90, line: 320 },
    children: [new TextRun({ text, color: "27354D", size: 22 })]
  });

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [new TextRun({ text: resume.target_title || "岗位定制简历", bold: true, color: "12213D", size: 36 })]
    })
  ];

  if (resume.summary.length) {
    children.push(sectionHeading("个人摘要"));
    resume.summary.forEach((line) => children.push(bodyParagraph(line.text)));
  }

  if (resume.capabilities.length) {
    children.push(sectionHeading("核心能力"));
    resume.capabilities.forEach((item) => children.push(bodyParagraph(`${item.label}：${item.content}`)));
  }

  if (resume.experiences.length) {
    children.push(sectionHeading("经历"));
    resume.experiences.forEach((experience) => {
      children.push(new Paragraph({
        spacing: { before: 130, after: 70 },
        children: [new TextRun({ text: experience.title, bold: true, color: "1F2E48", size: 24 })]
      }));
      if (experience.scene_summary.text) children.push(bodyParagraph(experience.scene_summary.text));
      experience.bullets.forEach((bullet) => {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 70, line: 310 },
          children: [new TextRun({ text: bullet.text, color: "27354D", size: 22 })]
        }));
      });
    });
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei" },
          paragraph: { spacing: { line: 320 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 }
        }
      },
      children
    }]
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${resumeExportBaseName(resume)}.docx`);
}

export async function downloadResumePdf(resume: FinalResume, element: HTMLElement) {
  const html2pdfModule = await import("html2pdf.js");
  const html2pdf = html2pdfModule.default;
  const exportNode = element.cloneNode(true) as HTMLElement;
  exportNode.style.width = "794px";
  exportNode.style.maxWidth = "none";
  exportNode.style.position = "fixed";
  exportNode.style.left = "-10000px";
  exportNode.style.top = "0";
  exportNode.style.boxShadow = "none";
  document.body.appendChild(exportNode);

  try {
    const options = {
      filename: `${resumeExportBaseName(resume)}.pdf`,
      margin: [10, 10, 10, 10] as [number, number, number, number],
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      pagebreak: { mode: ["css", "legacy"], avoid: [".resume-export-experience"] }
    };
    await html2pdf()
      .set(options)
      .from(exportNode)
      .save();
  } finally {
    exportNode.remove();
  }
}
