import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import CodeSection from '@/components/CodeSection'
import LiveDemo from '@/components/LiveDemo'
import WebhookDemo from '@/components/WebhookDemo'
import HowItWorks from '@/components/HowItWorks'
import SDKEcosystem from '@/components/SDKEcosystem'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <CodeSection />
        <LiveDemo />
        <WebhookDemo />
        <HowItWorks />
        <SDKEcosystem />
      </main>
      <Footer />
    </>
  )
}
