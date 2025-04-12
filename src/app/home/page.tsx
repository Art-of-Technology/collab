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
        <div className={`min-h-screen flex flex-col font-landing `}>
            <header className="container  max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
                <div className="flex items-center">
                    <span className="text-2xl font-bold flex items-center">
                        <Image
                            src="/Icon.svg"
                            alt="Collab"
                            width={40}
                            height={40}
                            className="mr-2 dark:invert" />
                        Collab
                    </span>
                </div>
                <div className='flex items-center'>
                    <Link href="/login" className='mr-4'>
                        <Button variant="secondary" className="">
                            <span className="hidden md:inline">Login</span>
                            <span className="md:hidden">Login</span>
                        </Button>
                    </Link>
                </div>


            </header>

            <main className={`flex-1 container max-w-5xl mx-auto px-4 py-12 flex flex-col items-center mt-20 ${lora.className}`}>
                <div className="text-center  mx-auto mb-12">
                    <h1 className="text-6xl font-bold mb-6 leading-tight">
                        Empowering Collaboration, <br />One Click at a Time
                    </h1>
                    <p className="text-lg text-gray-600 mb-8">
                        Collab is a collaborative platform designed to streamline your workflow and enhance team productivity. Whether you’re managing projects, brainstorming ideas, or tracking tasks, Collab has you covered.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/login" className="px-6 py-3 bg-green-800 hover:bg-green-900 text-white rounded-md transition-colors">
                            Get Started
                        </Link>
                        <Link href="mailto:" className='px-6 py-3  rounded-md transition-colors'>
                            Talk to Us
                        </Link>

                    </div>
                    <p className="text-sm text-gray-500 mt-3">No credit card required</p>
                </div>

                {/* Hero Image Section */}
                <section className="w-full bg-muted border rounded-lg shadow-md p-6 mb-12 mt-20">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
                        <div className="w-full md:w-1/2">
                            <Image
                                src="/hero.png"
                                alt="Collaboration interface"
                                width={610}
                                height={915}
                                className="rounded-lg shadow-lg"
                            />
                        </div>
                        <div className="w-full md:w-1/2 p-6 flex flex-col justify-between h-full">
                            <div>
                                <h2 className="text-4xl font-bold mb-4">Your new <br />collaboration partner.</h2>
                                <p className="text-gray-600 dark:text-gray-300 mb-6">
                                    Ditch the clunky tools and bring your team together on a platform that’s built for real collaboration. Chat, plan, and execute—all in one place, without losing momentum.
                                </p>
                            </div>
                            <ul className="space-y-4 text-gray-700 dark:text-gray-300 mt-8">
                                <li className="flex items-start">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1" />
                                    Real-time messaging, tasks, and file sharing—all under one roof.
                                </li>
                                <li className="flex items-start">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1" />
                                    Seamless integration with your favourite tools and workflows.
                                </li>
                                <li className="flex items-start">
                                    <CheckSquare className="text-green-600 dark:text-green-400 mr-2 mt-1" />
                                    Built-in analytics to track progress and team performance.
                                </li>
                            </ul>
                        </div>

                    </div>
                </section>

                <section className="w-full py-20 px-4 text-foreground mt-20">
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex-1">
                            <h2 className="text-4xl md:text-5xl font-serif font-semibold leading-tight">
                                Work better.<br />Together.
                            </h2>
                        </div>
                        <div className="flex flex-col items-start md:items-end">

                            <Link href="/login" className="px-6 py-3 bg-green-800 hover:bg-green-900 text-white rounded-md transition-colors">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </section>



                {/* Features Section */}
                <section
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full relative overflow-hidden "
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
                            className="bg-muted backdrop-blur-sm rounded-lg p-10 shadow-sm hover:shadow-md transition-shadow h-96  "
                        >
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
                <section className="w-full py-20 px-4 text-foreground mt-20">
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex-1">
                            <h2 className="text-3xl md:text-4xl font-serif font-semibold leading-tight">
                                What makes Collab different?
                            </h2>
                        </div>

                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-15">
                        <div>
                            <h4 className="text-lg font-semibold mb-2">All-in-one Platform</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">No more switching between tools. Collab brings your entire workflow together.</p>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold mb-2">Real-time Everything</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">From chat to tasks, changes appear instantly. Stay in sync with your team, always.</p>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold mb-2">Customisable for Teams</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">Whether you’re a startup or an enterprise, Collab fits your structure and scale.</p>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold mb-2">No Learning Curve</h4>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">Familiar, intuitive, and easy to use — your team will love it from day one.</p>
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section className="w-full py-20 px-4 bg-muted dark:bg-background rounded-lg shadow-md mt-20">
                    <div className="max-w-6xl mx-auto text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">Simple pricing for every team</h2>
                        <p className="text-gray-600 dark:text-gray-300">
                            Choose the plan that fits your team’s needs. Upgrade any time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {/* Free */}
                        <div className="bg-white dark:bg-background/40 p-8 rounded-lg shadow-sm border flex flex-col">
                            <h3 className="text-xl font-semibold mb-2">Free</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">For individuals or small teams just getting started.</p>
                            <div className="text-3xl font-bold mb-4">£0<span className="text-base font-medium">/mo</span></div>
                            <ul className="text-sm text-gray-600 dark:text-gray-300 flex-1 space-y-2 mb-6">
                                <li>✅ Up to 3 users</li>
                                <li>✅ Task management</li>
                                <li>✅ Basic integrations</li>
                            </ul>
                            <Button className="mt-auto w-full">Get Started</Button>
                        </div>

                        {/* Pro */}
                        <div className="bg-white dark:bg-background/40 p-8 rounded-lg shadow-md border-2 border-green-700 flex flex-col">
                            <h3 className="text-xl font-semibold mb-2">Pro</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">For growing teams that need more power and collaboration.</p>
                            <div className="text-3xl font-bold mb-4">£29<span className="text-base font-medium">/mo</span></div>
                            <ul className="text-sm text-gray-600 dark:text-gray-300 flex-1 space-y-2 mb-6">
                                <li>✅ Up to 25 users</li>
                                <li>✅ Advanced workflows</li>
                                <li>✅ Real-time collaboration</li>
                                <li>✅ Priority support</li>
                            </ul>
                            <Button className="mt-auto w-full bg-green-800 hover:bg-green-900 text-white">Start Pro</Button>
                        </div>

                        {/* Enterprise */}
                        <div className="bg-white dark:bg-background/40 p-8 rounded-lg shadow-sm border flex flex-col">
                            <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">Customised solutions for large organisations.</p>
                            <div className="text-3xl font-bold mb-4">Contact us</div>
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
                <section className="w-full py-16 px-4 bg-gray-100 dark:bg-background/50 rounded-lg shadow-sm ">
                    <div className="max-w-4xl mx-auto text-center">
                        <h3 className="text-2xl font-semibold mb-4">Trusted by teams around the world</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
                            Over <span className="font-semibold">25,000 teams</span> use Collab to manage projects, communicate better, and get things done faster.
                        </p>
                        <div className="flex justify-center items-center gap-6 flex-wrap">
                            <Image src="/companies/microsoft.svg" alt="Company 1" width={100} height={20} />
                            <Image src="/companies/airbnb.svg" alt="Company 2" width={50} height={20} />
                            <Image src="/companies/coca-cola.svg" alt="Company 3" width={50} height={20} />
                        </div>
                    </div>
                </section>



                {/* Call to Action Section */}
                <section className="w-full py-20 px-4 text-center bg-green-900 text-white rounded-lg mt-20 mb-20">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to streamline your workflow?</h2>
                    <p className="mb-6 text-lg">Start your journey with Collab today. It’s free and takes less than 2 minutes to get started.</p>
                    <Link href="/login">
                        <Button className="bg-white text-green-900 font-semibold hover:bg-gray-100 px-6 py-3 rounded-md">
                            Get Started
                        </Button>
                    </Link>
                </section>


            </main>

            <footer className="bg-muted text-foreground py-12 mt-12">
                <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-start gap-8">
                    <div>
                        <h4 className="text-xl font-semibold mb-2">Collab</h4>
                        <p className="text-sm text-gray-400">Empowering Collaboration, One Click at a Time.</p>
                    </div>
                    <div className="flex gap-12">
                        <div>
                            <h5 className="font-semibold mb-2">Product</h5>
                            <ul className="space-y-1 text-sm text-gray-400">
                                <li><Link href="#">Features</Link></li>
                                <li><Link href="#">Pricing</Link></li>
                                <li><Link href="#">Integrations</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-semibold mb-2">Company</h5>
                            <ul className="space-y-1 text-sm text-gray-400">
                                <li><Link href="#">About</Link></li>
                                <li><Link href="#">Careers</Link></li>
                                <li><Link href="#">Contact</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="text-center text-sm text-gray-500 mt-8">
                    © {new Date().getFullYear()} Collab. All rights reserved.
                </div>
            </footer>

        </div>
    );
}
