import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Bus, HeartHandshake, ShieldCheck, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const values = ['Godliness', 'Modesty', 'Integrity', 'Self-reliance', 'Commitment', 'Diligence', 'Discipline'];

export default function WelcomePage() {
  const { theme, toggle } = useTheme();
  return (
    <main className="min-h-screen overflow-hidden bg-surfaceAlt text-ink">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Treasure Corner Schools home">
          <img src="/Treasure Corner Community Crest.svg" alt="" className="h-14 w-auto" />
          <span className="font-serif text-lg font-bold text-brand-900">Treasure Corner Schools</span>
        </Link>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-3 py-2 text-sm" onClick={toggle}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <Link to="/login" className="btn-primary px-4 py-2 text-sm">Sign in to the portal <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-2 md:px-8 md:pb-24 md:pt-12">
        <div className="relative z-10">
          <p className="kicker text-brand-700">Creche · Nursery · Primary · College</p>
          <h1 className="mt-4 max-w-2xl font-serif text-4xl font-bold leading-tight text-brand-900 md:text-6xl">Growing bright minds with <span className="text-brand-600">godly character.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-inkMuted">A welcoming school where children are heard, their talents are nurtured, and learning builds confidence, strong values and a love of learning.</p>
          <p className="mt-4 font-semibold text-brand-700">“Model for excellence and godly character.”</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login" className="btn-primary">Sign in to the portal <ArrowRight className="h-4 w-4" /></Link>
            <a href="#our-story" className="btn-secondary">Discover our school</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-inkMuted">
            <span className="rounded-full border border-line bg-surface px-3 py-1.5">A home away from home</span>
            <span className="rounded-full border border-line bg-surface px-3 py-1.5">Learning for mind, character and body</span>
          </div>
        </div>
        <div className="relative min-h-[320px] md:min-h-[440px]">
          <div className="absolute inset-4 rounded-[36px] bg-gradient-to-br from-brand-200 via-brand-50 to-ocean-200 dark:from-[#32205c] dark:via-[#1b1332] dark:to-ocean-900" />
          <div className="absolute left-2 top-10 h-24 w-24 rounded-full bg-marigold-200/70 blur-sm" />
          <div className="absolute right-3 top-8 rounded-3xl border border-white/50 bg-white/75 p-4 shadow-xl backdrop-blur-sm dark:bg-[#21183b]/85">
            <Sparkles className="mb-2 h-6 w-6 text-marigold-600" />
            <p className="font-serif text-lg font-bold text-brand-900 dark:text-white">Every child has potential.</p>
            <p className="max-w-[210px] text-sm text-inkMuted">We help them discover it, develop it and use it well.</p>
          </div>
          <div className="absolute bottom-8 left-4 right-4 grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-[#2a1459] p-5 text-white shadow-xl">
              <BookOpen className="mb-3 h-7 w-7 text-[#c9b6ff]" />
              <p className="font-bold">Learning with purpose</p>
              <p className="mt-1 text-sm text-white/75">Thinking, social and emotional, and physical development.</p>
            </div>
            <div className="rounded-3xl bg-white/90 p-5 text-[#2a1459] shadow-xl dark:bg-[#21183b]/90 dark:text-white">
              <HeartHandshake className="mb-3 h-7 w-7 text-ocean-600" />
              <p className="font-bold">Care that listens</p>
              <p className="mt-1 text-sm text-inkMuted">Children’s ideas are heard and considered.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="our-story" className="border-y border-line bg-surface px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="kicker text-brand-700">Our story</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-brand-900 md:text-4xl">Small beginnings. A lasting purpose.</h2>
          </div>
          <div className="space-y-5 text-inkMuted">
            <p>In September 2011, the journey began as <strong className="text-ink">Treasured Seeds Childcare</strong>, caring for two babies at No. 29 Ajiboye Street, Alapere, Ketu.</p>
            <p>In September 2015, that vision grew into <strong className="text-ink">Treasure Corner Schools</strong>, welcoming 20 pupils at No. 22 Oyarinu Street, Alapere. Our purpose remains the same: quality education at an affordable fee in a conducive learning environment.</p>
            <p>Under the leadership of Proprietress Mrs Bola Adeniyi, our management and teaching team work to support each child’s academic, physical, social, spiritual and intellectual growth.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <p className="kicker text-brand-700">What guides us</p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-brand-900 md:text-4xl">Excellence in learning. Character for life.</h2>
          <p className="mt-3 text-inkMuted">We want every child to discover their strengths, enjoy learning in a safe environment, and grow into a self-reliant leader with godly character. Strong moral values guide our work.</p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => <div key={value} className="rounded-2xl border border-line bg-surface p-4 font-semibold shadow-sm"><ShieldCheck className="mb-3 h-5 w-5 text-brand-600" />{value}</div>)}
        </div>
      </section>

      <section className="bg-brand-900 px-5 py-14 text-white dark:bg-[#1b1332] md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="kicker text-[#c9b6ff]">A supportive environment</p>
            <h2 className="mt-3 font-serif text-3xl font-bold md:text-4xl">A safe place to learn, play and belong.</h2>
            <p className="mt-4 max-w-xl text-white/75">Our school has ventilated classrooms, suitable furniture, a large playground and two air-conditioned school buses. We want every child to feel at home while learning.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5"><BookOpen className="mb-3 h-6 w-6 text-marigold-200 dark:text-marigold-500" /><p className="font-bold">Learning for the whole child</p><p className="mt-2 text-sm text-white/70">Thinking, social and emotional, and physical growth.</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5"><Bus className="mb-3 h-6 w-6 text-ocean-200 dark:text-ocean-500" /><p className="font-bold">Facilities for everyday learning</p><p className="mt-2 text-sm text-white/70">Comfortable classrooms, play space and school transport.</p></div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 text-center md:px-8">
        <p className="kicker text-brand-700">Parents · Teachers · School management</p>
        <h2 className="mt-3 font-serif text-3xl font-bold text-brand-900">Your school information, in one place.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-inkMuted">Use the secure portal to view linked children, check fees, submit bank transfer details, download confirmed receipts and statements, or manage results, depending on your role.</p>
        <Link to="/login" className="btn-primary mt-6">Open the portal <ArrowRight className="h-4 w-4" /></Link>
      </section>

      <footer className="border-t border-line bg-surface px-5 py-6 text-center text-sm text-inkMuted">
        <p className="font-semibold text-brand-900">Treasure Corner Schools</p>
        <p className="mt-1">22, Oyarinu Street, Alapere Ketu · www.treasurecornerschools.com</p>
        <p className="mt-1">Model for excellence and godly character.</p>
      </footer>
    </main>
  );
}
