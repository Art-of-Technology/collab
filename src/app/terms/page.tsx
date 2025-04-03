import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms and Conditions | Collab by Weezboo",
  description: "Review the terms and conditions for using Collab by Weezboo"
};

export default function TermsPage() {
  return (
    <div className="relative h-auto overflow-auto">
      <div className="container py-10 max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-8">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none pb-20">
          <h1 className="text-3xl font-bold tracking-tight">Terms and Conditions</h1>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

          <h2>1. Agreement to Terms</h2>
          <p>
            These Terms and Conditions constitute a legally binding agreement made between you, whether personally or on behalf of an entity (&quot;you&quot;) and Collab by Weezboo (&quot;we,&quot; &quot;us&quot; or &quot;our&quot;), concerning your access to and use of the Collab by Weezboo platform.
          </p>
          <p>
            By accessing or using Collab by Weezboo, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access the platform.
          </p>

          <h2>2. Intellectual Property Rights</h2>
          <p>
            The Collab by Weezboo platform and its original content, features, and functionality are owned by Weezboo and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
          </p>
          <p>
            Unless otherwise indicated, all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics on the platform (collectively, the &quot;Content&quot;) are owned or controlled by us or licensed to us, and are protected by copyright and trademark laws.
          </p>

          <h2>3. User Accounts</h2>
          <h3>3.1 Account Creation</h3>
          <p>
            When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.
          </p>
          <h3>3.2 Account Responsibilities</h3>
          <p>
            You are responsible for safeguarding the password that you use to access the platform and for any activities or actions under your password. You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.
          </p>

          <h2>4. User Content</h2>
          <h3>4.1 Content Ownership</h3>
          <p>
            You retain all your ownership rights in your content. By uploading content to the platform, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, distribute, and display such content in connection with providing the platform services.
          </p>
          <h3>4.2 Content Restrictions</h3>
          <p>
            You may not upload, transmit, or share content that:
          </p>
          <ul>
            <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or invasive of privacy</li>
            <li>Infringes any patent, trademark, trade secret, copyright, or other intellectual property rights</li>
            <li>Violates the legal rights (including the rights of publicity and privacy) of others or contains any material that could give rise to any civil or criminal liability</li>
            <li>Contains software viruses or any other computer code designed to disrupt functionality</li>
            <li>Impersonates any person or entity or falsely states or misrepresents your affiliation with a person or entity</li>
          </ul>

          <h2>5. Prohibited Activities</h2>
          <p>
            You may not access or use the platform for any purpose other than that for which we make it available. The platform may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.
          </p>
          <p>
            Prohibited activities include, but are not limited to:
          </p>
          <ul>
            <li>Attempting to bypass any measures designed to prevent or restrict access to the platform</li>
            <li>Engaging in unauthorized framing of or linking to the platform</li>
            <li>Making automated use of the system, such as using scripts to send comments or messages</li>
            <li>Interfering with, disrupting, or creating an undue burden on the platform or the networks or services connected to the platform</li>
            <li>Attempting to impersonate another user or person</li>
            <li>Using the platform in a manner inconsistent with any applicable laws or regulations</li>
          </ul>

          <h2>6. Fees and Payment</h2>
          <p>
            You agree to pay all fees or charges to your account in accordance with the fees, charges, and billing terms in effect at the time a fee or charge is due and payable. Where payment is required for certain features, you must provide current, complete, and accurate payment information. By providing your payment information, you authorize us to charge all sums described in the payment plans to such payment mechanism.
          </p>

          <h2>7. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </p>
          <p>
            Upon termination, your right to use the platform will immediately cease. If you wish to terminate your account, you may simply discontinue using the platform or delete your account.
          </p>

          <h2>8. Limitation of Liability</h2>
          <p>
            In no event shall Collab by Weezboo, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the platform; (ii) any conduct or content of any third party on the platform; (iii) any content obtained from the platform; and (iv) unauthorized access, use or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence) or any other legal theory, whether or not we have been informed of the possibility of such damage.
          </p>

          <h2>9. Disclaimer</h2>
          <p>
            Your use of the platform is at your sole risk. The platform is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. The platform is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement or course of performance.
          </p>

          <h2>10. Governing Law</h2>
          <p>
            These Terms shall be governed and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions.
          </p>
          <p>
            Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days&apos; notice prior to any new terms taking effect.
          </p>
          <p>
            By continuing to access or use our platform after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the platform.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            If you have any questions about these Terms and Conditions, please contact us at:
          </p>
          <ul>
            <li>Email: legal@weezboo.com</li>
            <li>Collab by Weezboo</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 