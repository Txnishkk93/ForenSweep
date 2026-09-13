"use client";

import Image from "next/image";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { useState } from "react";
import { Footer2 } from "@/components/footer2";
import {
    ArrowUpRight,
    Box,
    ClipboardCheck,
    CircleDollarSign,
    Eraser,
    FileText,
    FileSearch,
    Hexagon,
    ExternalLink,
    RotateCcw,
    Server,
    ShieldCheck,
    Triangle,
} from "lucide-react";

const logos = [
    { name: "Mercury", icon: CircleDollarSign },
    { name: "ramp", icon: ArrowUpRight },
    { name: "HEX", icon: Hexagon },
    { name: "Vercel", icon: Triangle },
    { name: "descript", icon: FileText },
    { name: "Cash App", icon: CircleDollarSign },
    { name: "runway", icon: Box },
];

const solutions = [
    {
        title: "Data Erasure",
        description: "Securely wipe files, drives, or cloud storage with certified, audit-proof deletion — built for GDPR/CCPA 'right to be forgotten' execution.",
        icon: Eraser,
        href: "/solutions/data-erasure",
    },
    {
        title: "Data Recovery",
        description: "Restore accidentally deleted or corrupted files across devices and cloud backups.",
        icon: RotateCcw,
        href: "/solutions/data-recovery",
    },
    {
        title: "Digital Forensics & Audit Trail",
        description: "Every action logged, timestamped, and exportable for legal and compliance review.",
        icon: FileSearch,
        href: "/solutions/digital-forensics",
    },
    {
        title: "Enterprise Fleet Management",
        description: "Bulk erasure and recovery across hundreds of devices, with role-based access for IT admins.",
        icon: Server,
        href: "/solutions/fleet-management",
    },
    {
        title: "Compliance Reporting",
        description: "One-click reports mapped to SOC 2, HIPAA, GDPR, and ISO 27001 requirements.",
        icon: ClipboardCheck,
        href: "/solutions/compliance-reporting",
    }, {
        title: "Evidence Integrity & Chain of Custody",
        description: "Preserve forensic evidence with cryptographic hashes, immutable activity logs, and verifiable chain-of-custody records.",
        icon: ShieldCheck,
        href: "/solutions/evidence-integrity",
    }
];

const insightCards = [
    {
        category: "Erasure Standard",
        title: "NIST SP 800-88 Rev. 2 — Guidelines for Media Sanitization",
        excerpt: "The official U.S. standard for securely erasing data from HDDs, SSDs, USB drives, and other media (Clear / Purge / Destroy, verification, audit records).",
        href: "https://csrc.nist.gov/pubs/sp/800/88/r2/final",
        image: "/download (1).jpg",
        external: true,
    },
    {
        category: "Erasure Standard",
        title: "ATA Security Feature Set — SECURITY ERASE UNIT",
        excerpt: "The ATA specification behind device-native secure erase commands used to wipe SATA HDDs and SSDs at the firmware level.",
        href: "https://www.thomas-krenn.com/en/wiki/ATA_Security_Feature_Set",
        image: "/download.jpg",
        external: true,
    },
    {
        category: "Erasure Standard",
        title: "Linux SSD Secure Erase (SATA & NVMe) — Arch Wiki",
        excerpt: "Practical, step-by-step commands to securely reset SATA and NVMe SSDs using hdparm and nvme-cli, including warnings about frozen mode and crypto erase.",
        href: "https://wiki.archlinux.org/title/Solid_state_drive/Memory_cell_clearing",
        image: "/download (2).jpg",
        external: true,
    },
    {
        category: "Forensics Tool",
        title: "PhotoRec — File Carving Documentation",
        excerpt: "Official docs for PhotoRec, the leading open-source signature-based file carving tool used to recover deleted files without file-system metadata.",
        href: "https://www.cgsecurity.org/wiki/PhotoRec",
        image: "/download (3).jpg",
        external: true,
    },
    {
        category: "Forensics Tool",
        title: "Scalpel — Forensic File Carving Tool",
        excerpt: "Reference implementation for configurable, signature-based file carving; useful for understanding signature databases and carving workflows.",
        href: "https://github.com/sleuthkit/scalpel",
        image: "/graphic design inspo.jpg",
        external: true,
    },
    {
        category: "Legal Framework",
        title: "GDPR — Article 5(1)(e) Storage Limitation",
        excerpt: "The legal basis in EU law for “data must be kept no longer than necessary”, driving retention schedules and defensible deletion policies.",
        href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679",
        image: "/(2) Home _ X.jpg",
        external: true,
    },
    {
        category: "Legal Framework",
        title: "HIPAA Privacy Rule — Retention of Documentation (§164.530(j))",
        excerpt: "U.S. healthcare rule requiring retention of privacy policies and certain records for at least 6 years, a common benchmark in retention matrices.",
        href: "https://www.hhs.gov/hipaa/for-professionals/privacy/index.html",
        image: "/img11.jpg",
        external: true,
    },
];

function TextureImage({ alt, src }: { alt: string; src: string }) {
    return (
        <div className="relative aspect-video overflow-hidden bg-neutral-200">
            <Image src={src} alt={alt} fill loading="eager" sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
            <div
                aria-hidden="true"
                className="absolute inset-0 mix-blend-multiply"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.7) 0.8px, transparent 1px)",
                    backgroundSize: "5px 5px",
                }}
            />
        </div>
    );
}

function TextureImage2({ alt, src }: { alt: string; src: string }) {
    return (
        <div className="relative aspect-video overflow-hidden bg-neutral-200">
            <Image
                src={src}
                alt={alt}
                fill
                loading="eager"
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
            />
            <div
                aria-hidden="true"
                className="absolute inset-0 mix-blend-multiply"
                style={{
                    backgroundImage:
                        "radial-gradient(circle, rgba(0,0,0,0.7) 0.8px, transparent 1px)",
                    backgroundSize: "5px 5px",
                }}
            />
        </div>
    );
}

function SpotlightCard({
    children,
    className = "",
    index = 0,
}: {
    children: React.ReactNode;
    className?: string;
    index?: number;
}) {
    const mouseX = useMotionValue(-200);
    const mouseY = useMotionValue(-200);
    const spotlight = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, rgba(0, 0, 0, 0.1), transparent 72%)`;

    function handleMouseMove(event: React.MouseEvent<HTMLElement>) {
        const bounds = event.currentTarget.getBoundingClientRect();
        mouseX.set(event.clientX - bounds.left);
        mouseY.set(event.clientY - bounds.top);
    }

    return (
        <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            onMouseMove={handleMouseMove}
            className={`group relative overflow-hidden rounded-sm border border-neutral-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-neutral-400 ${className}`}
        >
            <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: spotlight }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 mix-blend-multiply transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 0.7px, transparent 0.8px)",
                    backgroundSize: "5px 5px",
                }}
            />
            {children}
        </motion.article>
    );
}

function SolutionCard({
    title,
    description,
    icon: Icon,
    href,
    index,
}: {
    title: string;
    description: string;
    icon: typeof Eraser;
    href: string;
    index: number;
}) {
    return (
        <SpotlightCard index={index} className="min-h-[270px] p-6">
            <div className="relative z-10 flex min-h-[218px] flex-col">
                <Icon className="h-6 w-6 text-neutral-900" strokeWidth={1.7} aria-hidden="true" />
                <h3 className="mt-4 text-lg font-bold text-neutral-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{description}</p>
                <a href={href} className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-neutral-900 transition-all group-hover:gap-2">Learn more <ArrowUpRight size={15} aria-hidden="true" /></a>
            </div>
        </SpotlightCard>
    );
}

export default function LandingPage() {
    const [activeInsightTab, setActiveInsightTab] = useState("All");
    const featuredInsight = insightCards[0]!;
    const otherInsightCards = insightCards.slice(1);
    const visibleInsightCards = activeInsightTab === "All" || activeInsightTab === "Standards & References"
        ? otherInsightCards
        : [];

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f4f4f2] font-sans text-neutral-950">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 z-20 opacity-[0.16] mix-blend-multiply"
                style={{
                    backgroundImage:
                        "radial-gradient(circle, rgba(20,20,20,0.42) 0.7px, transparent 0.8px)",
                    backgroundSize: "5px 5px",
                }}
            />

            <header className="relative z-30 flex items-center justify-between gap-8 px-6 py-6 sm:px-10">
                <a href="#top" className="shrink-0 text-lg font-bold tracking-tight">
                    ForenSweep<sup className="ml-0.5 text-[9px]">®</sup>
                </a>
                <nav className="hidden items-center gap-8 text-sm text-neutral-700 md:flex" aria-label="Primary navigation">
                    <a href="#insights" className="transition-colors hover:text-black">Insights</a>
                    <a href="#solutions" className="transition-colors hover:text-black">Solutions</a>
                    <a href="#pricing" className="transition-colors hover:text-black">Pricing</a>
                </nav>
                <div className="flex items-center gap-5 text-sm">
                    <a href="/login" className="hidden text-neutral-700 transition-colors hover:text-black sm:block">Login</a>
                    <a href="#contact" className="rounded-full bg-black px-4 py-2 font-medium text-white transition hover:-translate-y-0.5 hover:bg-neutral-800">Try Now</a>
                </div>
            </header>

            <section id="top" className="relative z-10 flex min-h-[calc(100vh-88px)] flex-col items-center pt-16 sm:pt-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7 }}
                    className="px-5 text-center"
                >
                    <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.06em] text-neutral-900 sm:text-6xl md:text-7xl">
                        Nothing Escapes
                        <br />
                        ForenSweep.
                    </h1>
                    <p className="mx-auto mt-6 max-w-[500px] text-sm leading-relaxed text-neutral-500 sm:mt-7">
                        Streamline evidence collection, analysis, and reporting — all in one secure platform.
                    </p>
                    <a
                        href="#contact"
                        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                        Get In Touch
                        <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.18 }}
                    className="relative mt-12 h-[38vh] min-h-[270px] w-full overflow-hidden sm:mt-14 sm:h-[52vh] sm:min-h-[390px]"
                >
                    <Image
                        src="/725149977493389933.jpg"
                        alt="Robotic and human hands reaching toward one another"
                        fill
                        priority
                        sizes="100vw"
                        className="object-cover grayscale contrast-125"
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 mix-blend-multiply"
                        style={{
                            backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.75) 1px, transparent 1.2px)",
                            backgroundSize: "6px 6px",
                        }}
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#f4f4f2] via-transparent to-[#f4f4f2]/40" />
                </motion.div>

                <div className="relative z-10 w-full border-t border-neutral-300/70 px-6 pb-10 pt-7 sm:px-10">
                    <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                        Trusted by teams of every scale
                    </p>
                    <div className="mx-auto mt-6 flex max-w-5xl items-center justify-start gap-8 overflow-x-auto pb-1 text-neutral-700 sm:justify-center sm:gap-10">
                        {logos.map(({ name, icon: Icon }) => (
                            <div key={name} className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-tight">
                                <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
                                {name}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="solutions" className="relative z-10 border-t border-neutral-200 px-6 py-24 sm:px-10">
                <div className="mx-auto max-w-6xl">
                    <div className="text-center">
                        <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">Solutions</p>
                        <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900 md:text-5xl">Built for every stage of data lifecycle.</h2>
                        <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-neutral-500">From secure erasure to full audit trails — everything compliance and IT teams need in one workspace.</p>
                    </div>
                    <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
                        {solutions.map((solution, index) => (
                            <SolutionCard key={solution.title} {...solution} index={index} />
                        ))}
                    </div>
                </div>
            </section>

            <section id="insights" className="relative z-10 border-t border-neutral-200 px-6 py-24 sm:px-10">
                <div className="mx-auto max-w-6xl">
                    <div className="text-center">
                        <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">Insights</p>
                        <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900 md:text-5xl">Guides, updates, and stories from the field.</h2>
                    </div>
                    <div className="mt-6 mb-12 flex gap-6 overflow-x-auto border-b border-neutral-200 pb-px text-sm whitespace-nowrap md:justify-center">
                        {["All", "Standards & References"].map((tab) => (
                            <button key={tab} type="button" onClick={() => setActiveInsightTab(tab)} className={`shrink-0 pb-3 ${activeInsightTab === tab ? "border-b-2 border-black font-medium text-black" : "text-neutral-400 transition-colors hover:text-neutral-700"}`}>{tab}</button>
                        ))}
                    </div>

                    <SpotlightCard index={0} className="mb-10 grid md:grid-cols-2">
                        <div className="relative z-10">
                            <TextureImage2 src={featuredInsight.image} alt={`${featuredInsight.title} thumbnail`} />
                        </div>
                        <div className="relative z-10 flex flex-col justify-center p-8">
                            <p className="text-xs uppercase tracking-wide text-neutral-500">{featuredInsight.category}</p>
                            <h3 className="mt-2 text-2xl font-bold text-neutral-900">{featuredInsight.title}</h3>
                            <p className="mt-3 text-sm leading-relaxed text-neutral-500">{featuredInsight.excerpt}</p>
                            <a href={featuredInsight.href} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-neutral-900 transition-all hover:gap-2">View source <ExternalLink size={14} aria-hidden="true" /></a>
                        </div>
                    </SpotlightCard>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        {visibleInsightCards.map(({ category, title, excerpt, href, image, external }, index) => (
                            <SpotlightCard key={title} index={index + 1} className="overflow-hidden">
                                <div className="relative z-10">
                                    <TextureImage src={image} alt={`${title} thumbnail`} />
                                </div>
                                <div className="relative z-10 p-6">
                                    <p className="text-xs uppercase tracking-wide text-neutral-500">{category}</p>
                                    <h3 className="mt-2 text-base font-bold text-neutral-900">{title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-neutral-500">{excerpt}</p>
                                    <a
                                        href={href}
                                        target={external ? "_blank" : undefined}
                                        rel={external ? "noopener noreferrer" : undefined}
                                        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-900 transition-all group-hover:gap-2"
                                    >
                                        {external ? "View source" : "Read"}
                                        {external ? <ExternalLink size={14} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
                                    </a>
                                </div>
                            </SpotlightCard>
                        ))}
                    </div>
                </div>
            </section>

            <Footer2
                className="relative z-10 border-t border-neutral-200 bg-[#f4f4f2] px-6 text-neutral-950 sm:px-10"
                logo={{
                    url: "https://forensweep.com",
                    src: "/logo.svg",
                    alt: "ForenSweep logo",
                    title: "ForenSweep",
                }}
                description="Certified erasure, recovery, and audit tools for compliance and IT teams."
                sections={[
                    {
                        title: "Product",
                        links: [
                            { name: "Data Erasure", href: "/solutions/data-erasure" },
                            { name: "Data Recovery", href: "/solutions/data-recovery" },
                            { name: "Digital Forensics & Audit Trail", href: "/solutions/forensics-audit-trail" },
                            { name: "Enterprise Fleet Management", href: "/solutions/fleet-management" },
                            { name: "Compliance Reporting", href: "/solutions/compliance-reporting" },
                        ],
                    },
                    {
                        title: "Company",
                        links: [
                            { name: "About", href: "/about" },
                            { name: "Insights", href: "/insights" },
                            { name: "Careers", href: "/careers" },
                            { name: "Contact", href: "/contact" },
                        ],
                    },
                    {
                        title: "Resources",
                        links: [
                            { name: "Standards & References", href: "/standards" },
                            { name: "Documentation", href: "/docs" },
                            { name: "API Reference", href: "/api" },
                            { name: "Status", href: "/status" },
                        ],
                    },
                    {
                        title: "Support",
                        links: [
                            { name: "Help Center", href: "/support" },
                            { name: "Security", href: "/legal/security" },
                            { name: "GDPR Compliance", href: "/legal/gdpr" },
                        ],
                    },
                ]}
                copyright={`© ${new Date().getFullYear()} ForenSweep. All rights reserved.`}
                legalLinks={[
                    { name: "Privacy Policy", href: "/legal/privacy" },
                    { name: "Terms and Conditions", href: "/legal/terms" },
                    { name: "Data Processing Agreement", href: "/legal/dpa" },
                ]}
            />
        </main>
    );
}
