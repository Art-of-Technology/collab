'use client'

import { Lora } from 'next/font/google';

const lora = Lora({
    subsets: ['latin'],
    weight: ['400', '700'], // ihtiyacına göre diğer ağırlıkları da ekleyebilirsin
});


import React from "react";
import { Button } from "@/components/ui/button";
import { CheckSquare } from "lucide-react";
import Link from "next/link";
import Image from "next/image";


const features = [
    {
        title: "Task Management",
        description: "Efficiently manage tasks and projects with our intuitive interface.",
        imageAlt: "Task management preview",
    },
    {
        title: "Real-time Collaboration",
        description: "Collaborate with your team in real-time, no matter where you are.",
        imageAlt: "Real-time collaboration preview",
    },
    {
        title: "Analytics Dashboard",
        description: "Get insights into your team's performance with our analytics dashboard.",
        imageAlt: "Analytics dashboard preview",
    },
    {
        title: "Integrations",
        description: "Seamlessly integrate with your favorite tools and services.",
        imageAlt: "Integrations preview",
    },
    {
        title: "Notifications",
        description: "Stay updated with real-time notifications and alerts.",
        imageAlt: "Notifications preview",
    },
    {
        title: "Feedback System",
        description: "Gather feedback from your team to improve collaboration.",
        imageAlt: "Feedback system preview",
    },

]

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col font-landing">
            <header className="container max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex justify-between items-center">
                <div className="flex items-center">
                    <span className="text-xl sm:text-2xl font-bold flex items-center">
                        <Image
                            src="/Icon.svg"
                            alt="Collab"
                            width={32}
                            height={32}
                            className="mr-2 sm:w-10 sm:h-10 dark:invert" 
                        />
                        Collab
                    </span>
                </div>
                <div className="flex items-center">
                    <Link href="/login" className="mr-2 sm:mr-4">
                        <Button variant="secondary" className="px-3 py-2 sm:px-4 sm:py-2 text-sm sm:text-base">
                            Login
                        </Button>
                    </Link>
                </div>
            </header>

            <main className={`flex-1 container max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center mt-4 sm:mt-8 md:mt-20 ${lora.className}`}>
                <div className="text-center mx-auto mb-8 sm:mb-12">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight px-2">
                        Empowering Collaboration, <br className="hidden sm:block" />
                        <span className="sm:hidden">One Click at a Time</span>
                        <span className="hidden sm:inline">One Click at a Time</span>
                    </h1>
                    <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 px-2 max-w-2xl mx-auto leading-relaxed">
                        Collab is a collaborative platform designed to streamline your workflow and enhance team productivity. Whether you&apos;re managing projects, brainstorming ideas, or tracking tasks, Collab has you covered.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
                        <Link 
                            href="/login" 
                            className="px-6 py-3 bg-green-800 hover:bg-green-900 text-white rounded-md transition-colors text-center font-medium"
                        >
                            Get Started
                        </Link>
                        <Link 
                            href="mailto:" 
                            className="px-6 py-3 border border-gray-300 hover:border-gray-400 rounded-md transition-colors text-center font-medium"
                        >
                            Talk to Us
                        </Link>
                    </div>
                    <p className="text-sm text-gray-500 mt-3">No credit card required</p>
                </div>

                {/* Hero Image Section */}
                <section className="w-full bg-muted border rounded-lg shadow-md p-4 sm:p-6 mb-8 sm:mb-12 mt-8 sm:mt-20">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6 sm:gap-12">
                        <div className="w-full md:w-1/2 order-2 md:order-1">
                            <Image
                                src="/hero.png"
                                alt="Collaboration interface"
                                width={610}
                                height={915}
                                className="rounded-lg shadow-lg w-full h-auto"
                            />
                        </div>
                        <div className="w-full md:w-1/2 p-2 sm:p-6 flex flex-col justify-between h-full order-1 md:order-2">
                            <div>
                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 leading-tight">
                                    Your new <br />collaboration partner.
                                </h2>
                                <p className="text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 text-sm sm:text-base leading-relaxed">
                                    Ditch the clunky tools and bring your team together on a platform that&apos;s built for real collaboration. Chat, plan, and execute—all in one place, without losing momentum.
                                </p>
                            </div>
                            <ul className="space-y-3 sm:space-y-4 text-gray-700 dark:text-gray-300 mt-4 sm:mt-8">
                                <li className="flex items-start text-sm sm:text-base">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" />
                                    Real-time messaging, tasks, and file sharing—all under one roof.
                                </li>
                                <li className="flex items-start text-sm sm:text-base">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" />
                                    Seamless integration with your favourite tools and workflows.
                                </li>
                                <li className="flex items-start text-sm sm:text-base">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" />
                                    Built-in analytics to track progress and team performance.
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="w-full py-12 sm:py-20 px-4 text-foreground mt-12 sm:mt-20">
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex-1">
                            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-semibold leading-tight">
                                Work better.<br />Together.
                            </h2>
                        </div>
                        <div className="flex flex-col items-start md:items-end w-full md:w-auto">
                            <Link href="/login" className="px-6 py-3 bg-green-800 hover:bg-green-900 text-white rounded-md transition-colors w-full md:w-auto text-center">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full relative overflow-hidden"
                
                // style={{
                //     backgroundImage: "url('/features/task.png')",
                //     backgroundSize: "fit",
                //     backgroundPosition: "center",
                //     backgroundRepeat: "no-repeat",
                // }}
                >
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-muted backdrop-blur-sm rounded-lg p-6 sm:p-10 shadow-sm hover:shadow-md transition-shadow min-h-[280px] sm:h-96"
                        >
                            <h4 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                {feature.title}
                            </h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                                {feature.description}
                            </p>
                                {/* {feature.imageSrc && (
                                <div className="mt-4 flex justify-center">
                                    <Image
                                        src={feature.imageSrc}
                                        alt={feature.imageAlt}
                                        width={100}
                                        height={100}
                                        className="rounded-lg"
                                    />
                                </div>
                            )} */}
                        </div>
                    ))}
                </section>

                {/* What makes Collab different */}
                <section className="w-full py-12 sm:py-20 px-4 text-foreground mt-12 sm:mt-20">
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 sm:mb-12">
                        <div className="flex-1">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-semibold leading-tight">
                                What makes Collab different?
                            </h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                        <div>
                            <h4 className="text-base sm:text-lg font-semibold mb-2">All-in-one Platform</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">No more switching between tools. Collab brings your entire workflow together.</p>
                        </div>
                        <div>
                            <h4 className="text-base sm:text-lg font-semibold mb-2">Real-time Everything</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">From chat to tasks, changes appear instantly. Stay in sync with your team, always.</p>
                        </div>
                        <div>
                            <h4 className="text-base sm:text-lg font-semibold mb-2">Customisable for Teams</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">Whether you&apos;re a startup or an enterprise, Collab fits your structure and scale.</p>
                        </div>
                        <div>
                            <h4 className="text-base sm:text-lg font-semibold mb-2">No Learning Curve</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">Familiar, intuitive, and easy to use — your team will love it from day one.</p>
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section className="w-full py-12 sm:py-20 px-4 bg-muted dark:bg-background rounded-lg shadow-md mt-12 sm:mt-20">
                    <div className="max-w-6xl mx-auto text-center mb-8 sm:mb-16">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">Simple pricing for every team</h2>
                        <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base px-4">
                            Choose the plan that fits your team&apos;s needs. Upgrade any time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
                        {/* Free */}
                        <div className="bg-white dark:bg-background/40 p-6 sm:p-8 rounded-lg shadow-sm border flex flex-col">
                            <h3 className="text-lg sm:text-xl font-semibold mb-2">Free</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">For individuals or small teams just getting started.</p>
                            <div className="text-2xl sm:text-3xl font-bold mb-4">£0<span className="text-base font-medium">/mo</span></div>
                            <ul className="text-sm text-gray-600 dark:text-gray-300 flex-1 space-y-2 mb-6">
                                <li>✅ Up to 3 users</li>
                                <li>✅ Task management</li>
                                <li>✅ Basic integrations</li>
                            </ul>
                            <Button className="mt-auto w-full">Get Started</Button>
                        </div>

                        {/* Pro */}
                        <div className="bg-white dark:bg-background/40 p-6 sm:p-8 rounded-lg shadow-md border-2 border-green-700 flex flex-col">
                            <h3 className="text-lg sm:text-xl font-semibold mb-2">Pro</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">For growing teams that need more power and collaboration.</p>
                            <div className="text-2xl sm:text-3xl font-bold mb-4">£29<span className="text-base font-medium">/mo</span></div>
                            <ul className="text-sm text-gray-600 dark:text-gray-300 flex-1 space-y-2 mb-6">
                                <li>✅ Up to 25 users</li>
                                <li>✅ Advanced workflows</li>
                                <li>✅ Real-time collaboration</li>
                                <li>✅ Priority support</li>
                            </ul>
                            <Button className="mt-auto w-full bg-green-800 hover:bg-green-900 text-white">Start Pro</Button>
                        </div>

                        {/* Enterprise */}
                        <div className="bg-white dark:bg-background/40 p-6 sm:p-8 rounded-lg shadow-sm border flex flex-col">
                            <h3 className="text-lg sm:text-xl font-semibold mb-2">Enterprise</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">Customised solutions for large organisations.</p>
                            <div className="text-2xl sm:text-3xl font-bold mb-4">Contact us</div>
                            <ul className="text-sm text-gray-600 dark:text-gray-300 flex-1 space-y-2 mb-6">
                                <li>✅ Unlimited users</li>
                                <li>✅ Dedicated success manager</li>
                                <li>✅ Custom integrations & SSO</li>
                                <li>✅ SLA & advanced analytics</li>
                            </ul>
                            <Link href="mailto:sales@collab.com">
                                <Button variant="outline" className="w-full">Contact Sales</Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Testimonials Section */}
                <section className="w-full py-12 sm:py-16 px-4 bg-gray-100 dark:bg-background/50 rounded-lg shadow-sm mt-12 sm:mt-20">
                    <div className="max-w-4xl mx-auto text-center">
                        <h3 className="text-xl sm:text-2xl font-semibold mb-4">Trusted by teams around the world</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 px-4">
                            Over <span className="font-semibold">25,000 teams</span> use Collab to manage projects, communicate better, and get things done faster.
                        </p>
                        <div className="flex justify-center items-center gap-4 sm:gap-6 flex-wrap">
                            <Image src="/companies/microsoft.svg" alt="Company 1" width={80} height={16} className="sm:w-[100px] sm:h-[20px]" />
                            <Image src="/companies/airbnb.svg" alt="Company 2" width={40} height={16} className="sm:w-[50px] sm:h-[20px]" />
                            <Image src="/companies/coca-cola.svg" alt="Company 3" width={40} height={16} className="sm:w-[50px] sm:h-[20px]" />
                        </div>
                    </div>
                </section>

                {/* Call to Action Section */}
                <section className="w-full py-12 sm:py-20 px-4 text-center bg-green-900 text-white rounded-lg mt-12 sm:mt-20 mb-12 sm:mb-20">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 px-2">Ready to streamline your workflow?</h2>
                    <p className="mb-6 text-base sm:text-lg px-4 max-w-2xl mx-auto">Start your journey with Collab today. It&apos;s free and takes less than 2 minutes to get started.</p>
                    <Link href="/login">
                        <Button className="bg-white text-green-900 font-semibold hover:bg-gray-100 px-6 py-3 rounded-md">
                            Get Started
                        </Button>
                    </Link>
                </section>
            </main>
            <footer className="bg-muted text-foreground py-8 sm:py-12 mt-8 sm:mt-12">
                <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-start gap-6 sm:gap-8">
                    <div className="mb-6 md:mb-0">
                        <h4 className="text-lg sm:text-xl font-semibold mb-2">Collab</h4>
                        <p className="text-sm text-gray-400">Empowering Collaboration, One Click at a Time.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-8 sm:gap-12 w-full md:w-auto">
                        <div>
                            <h5 className="font-semibold mb-2 text-sm sm:text-base">Product</h5>
                            <ul className="space-y-1 text-sm text-gray-400">
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">Features</Link></li>
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">Pricing</Link></li>
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">Integrations</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-semibold mb-2 text-sm sm:text-base">Company</h5>
                            <ul className="space-y-1 text-sm text-gray-400">
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">About</Link></li>
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">Careers</Link></li>
                                <li><Link href="#" className="hover:text-gray-300 transition-colors">Contact</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="text-center text-sm text-gray-500 mt-6 sm:mt-8 px-4">
                    © {new Date().getFullYear()} Collab. All rights reserved.
                </div>
            </footer>
        </div>
    );
}

