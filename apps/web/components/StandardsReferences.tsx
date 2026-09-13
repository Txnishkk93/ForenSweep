"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const references = [
  {
    category: "Erasure Standard",
    title: "NIST SP 800-88 Rev. 2 — Guidelines for Media Sanitization",
    description:
      "The official U.S. standard for securely erasing data from HDDs, SSDs, USB drives, and other media — covering Clear, Purge, and Destroy methods, verification, and audit records.",
    url: "https://csrc.nist.gov/pubs/sp/800/88/r2/final",
  },
  {
    category: "Erasure Standard",
    title: "ATA Security Feature Set — SECURITY ERASE UNIT",
    description:
      "The ATA specification behind device-native secure erase commands used to wipe SATA HDDs and SSDs at the firmware level.",
    url: "https://www.thomas-krenn.com/en/wiki/ATA_Security_Feature_Set",
  },
  {
    category: "Erasure Standard",
    title: "Linux SSD Secure Erase (SATA & NVMe) — Arch Wiki",
    description:
      "Practical, step-by-step commands to securely reset SATA and NVMe SSDs using hdparm and nvme-cli, including warnings about frozen mode and crypto erase.",
    url: "https://wiki.archlinux.org/title/Solid_state_drive/Memory_cell_clearing",
  },
  {
    category: "Forensics Tool",
    title: "PhotoRec — File Carving Documentation",
    description:
      "Official documentation for PhotoRec, the leading open-source signature-based file carving tool used to recover deleted files without relying on file-system metadata.",
    url: "https://www.cgsecurity.org/wiki/PhotoRec",
  },
  {
    category: "Forensics Tool",
    title: "Scalpel — Forensic File Carving Tool",
    description:
      "Reference implementation for configurable, signature-based file carving — useful for understanding signature databases and carving workflows.",
    url: "https://github.com/sleuthkit/scalpel",
  },
  {
    category: "Legal Framework",
    title: "GDPR — Article 5(1)(e) Storage Limitation",
    description:
      "The legal basis in EU law requiring that data be kept no longer than necessary — driving retention schedules and defensible deletion policies.",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679",
  },
  {
    category: "Legal Framework",
    title: "HIPAA Privacy Rule — Retention of Documentation (§164.530(j))",
    description:
      "U.S. healthcare rule requiring retention of privacy policies and certain records for at least 6 years — a common benchmark in retention matrices.",
    url: "https://www.hhs.gov/hipaa/for-professionals/privacy/index.html",
  },
];

export default function StandardsReferences() {
  return (
    <section className="relative z-10 border-t border-neutral-200 px-6 py-24 sm:px-10" aria-labelledby="standards-heading">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
            Standards &amp; References
          </p>
          <h2 id="standards-heading" className="mt-3 text-4xl font-extrabold tracking-tight text-neutral-900 md:text-5xl">
            Built on established standards, not guesswork.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-neutral-500">
            Every erasure, recovery, and compliance workflow in ForenSweep is grounded in recognized technical specifications and legal frameworks.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          {references.map(({ category, title, description, url }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="group flex min-h-[250px] flex-col rounded-lg border border-neutral-200 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-neutral-400"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">{category}</p>
              <h3 className="mt-2 text-lg font-bold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{description}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-neutral-900 transition-all hover:gap-2"
              >
                View source
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
