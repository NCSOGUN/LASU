import { BodyMap } from "@/features/landing/BodyMap";
import { Channels } from "@/features/landing/Channels";
import { Features } from "@/features/landing/Features";
import { Footer } from "@/features/landing/Footer";
import { Hero } from "@/features/landing/Hero";
import { HowItWorks } from "@/features/landing/HowItWorks";
import { LandingMotion } from "@/features/landing/LandingMotion";
import { PillNav } from "@/features/landing/PillNav";
import { Preloader } from "@/features/landing/Preloader";
import { Problem } from "@/features/landing/Problem";
import { Roadmap } from "@/features/landing/Roadmap";
import { Trust } from "@/features/landing/Trust";

// Section order: landing-references.md (how-it-works before the body map, approved).
export default function LandingPage() {
  return (
    <>
      <Preloader />
      <PillNav />
      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <BodyMap />
        <Features />
        <Channels />
        <Trust />
        <Roadmap />
      </main>
      <Footer />
      <LandingMotion />
    </>
  );
}
