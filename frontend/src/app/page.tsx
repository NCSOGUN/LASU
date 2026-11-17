import { Bento } from "@/features/landing/Bento";
import { Channels } from "@/features/landing/Channels";
import { FinalCta } from "@/features/landing/FinalCta";
import { Footer } from "@/features/landing/Footer";
import { Hero } from "@/features/landing/Hero";
import { LandingMotion } from "@/features/landing/LandingMotion";
import { PillNav } from "@/features/landing/PillNav";
import { Preloader } from "@/features/landing/Preloader";
import { Steps } from "@/features/landing/Steps";
import { Trust } from "@/features/landing/Trust";

// Landing v2: dark layout modelled on the 21st.dev voice-app template (user request), HealthAccess content.
export default function LandingPage() {
  return (
    <div className="landing min-h-dvh bg-night text-fog">
      <Preloader />
      <PillNav />
      <main id="main">
        <Hero />
        <Bento />
        <Steps />
        <Channels />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
      <LandingMotion />
    </div>
  );
}
