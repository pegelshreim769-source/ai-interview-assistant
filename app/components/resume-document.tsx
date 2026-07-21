"use client";

import { forwardRef } from "react";
import type { FinalResume } from "../lib/resume-studio/types";

type ResumeDocumentProps = {
  resume: FinalResume;
};

export const ResumeDocument = forwardRef<HTMLDivElement, ResumeDocumentProps>(function ResumeDocument(
  { resume },
  ref
) {
  return (
    <div ref={ref} className="resume-export-sheet">
      <header className="resume-export-header">
        <p>岗位定制简历</p>
        <h2>{resume.target_title || "目标岗位"}</h2>
      </header>

      {resume.summary.length ? (
        <section className="resume-export-section">
          <h3>个人摘要</h3>
          {resume.summary.map((line, index) => <p key={`summary-${index}`}>{line.text}</p>)}
        </section>
      ) : null}

      {resume.capabilities.length ? (
        <section className="resume-export-section">
          <h3>核心能力</h3>
          <div className="resume-export-capabilities">
            {resume.capabilities.map((item, index) => (
              <p key={`${item.label}-${index}`}><strong>{item.label}：</strong>{item.content}</p>
            ))}
          </div>
        </section>
      ) : null}

      {resume.experiences.length ? (
        <section className="resume-export-section">
          <h3>经历</h3>
          <div className="resume-export-experiences">
            {resume.experiences.map((experience) => (
              <article key={experience.experience_id} className="resume-export-experience">
                <h4>{experience.title}</h4>
                {experience.scene_summary.text ? <p>{experience.scene_summary.text}</p> : null}
                <ul>
                  {experience.bullets.map((bullet, index) => <li key={`${experience.experience_id}-${index}`}>{bullet.text}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
});
