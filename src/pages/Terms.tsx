import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/brand/SiteHeader';
import { SiteFooter } from '@/components/brand/SiteFooter';

export function Terms() {
  useSeoMeta({
    title: 'Terms of Service — LAYER.systems',
    description: 'Terms of Service for the LAYER.systems Nostr relay.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 pb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <ScrollText className="h-8 w-8 text-primary" />
            </div>
            <p className="eyebrow text-primary">Legal</p>
            <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-muted-foreground text-lg">
              Last updated: December 27, 2025
            </p>
          </div>

          {/* Introduction */}
          <Card>
            <CardHeader>
              <CardTitle>Introduction</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                Welcome to LAYER.systems. By accessing and using our Nostr relay service, you agree to be bound by these Terms of Service. Please read them carefully.
              </p>
            </CardContent>
          </Card>

          {/* Service Description */}
          <Card>
            <CardHeader>
              <CardTitle>1. Service Description</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                LAYER.systems provides a public Nostr relay service that allows users to publish and query events on the Nostr protocol. The service is provided "as is" and we make no guarantees about uptime, data persistence, or availability.
              </p>
              <ul>
                <li>The relay may be temporarily unavailable due to maintenance or technical issues</li>
                <li>Events may be deleted or modified at our discretion</li>
                <li>We reserve the right to refuse service to any user</li>
              </ul>
            </CardContent>
          </Card>

          {/* User Conduct */}
          <Card>
            <CardHeader>
              <CardTitle>2. User Conduct</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                By using LAYER.systems, you agree not to:
              </p>
              <ul>
                <li>Publish illegal content or content that violates applicable laws</li>
                <li>Engage in spam, phishing, or other abusive behaviors</li>
                <li>Attempt to disrupt or compromise the security of the relay</li>
                <li>Use the service to harass, threaten, or harm others</li>
                <li>Impersonate others or misrepresent your identity</li>
                <li>Violate intellectual property rights</li>
              </ul>
              <p>
                We reserve the right to remove content and ban users who violate these terms.
              </p>
            </CardContent>
          </Card>

          {/* Content Policy */}
          <Card>
            <CardHeader>
              <CardTitle>3. Content Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                You retain all rights to content you publish through our relay. However, by publishing content, you grant us a non-exclusive, worldwide license to store, cache, and distribute your content as necessary to operate the service.
              </p>
              <p>
                We may remove content that:
              </p>
              <ul>
                <li>Violates applicable laws or regulations</li>
                <li>Infringes on intellectual property rights</li>
                <li>Contains malware or malicious code</li>
                <li>Violates our content policies</li>
              </ul>
            </CardContent>
          </Card>

          {/* Limitation of Liability */}
          <Card>
            <CardHeader>
              <CardTitle>4. Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                LAYER.systems is provided "as is" without warranties of any kind. To the fullest extent permitted by law, we disclaim all warranties, express or implied.
              </p>
              <p>
                We are not liable for:
              </p>
              <ul>
                <li>Any data loss or corruption</li>
                <li>Service interruptions or downtime</li>
                <li>Content published by users</li>
                <li>Indirect, incidental, or consequential damages</li>
                <li>Loss of profits or revenue</li>
              </ul>
            </CardContent>
          </Card>

          {/* Privacy */}
          <Card>
            <CardHeader>
              <CardTitle>5. Privacy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                Your use of LAYER.systems is also governed by our{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                . Please review it to understand how we collect and use information.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Terms */}
          <Card>
            <CardHeader>
              <CardTitle>6. Changes to Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of the service after changes constitutes acceptance of the modified terms.
              </p>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card>
            <CardHeader>
              <CardTitle>7. Termination</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                We may terminate or suspend your access to the service at any time, without prior notice, for any reason, including violation of these Terms of Service.
              </p>
            </CardContent>
          </Card>

          {/* Governing Law */}
          <Card>
            <CardHeader>
              <CardTitle>8. Governing Law</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                These Terms of Service are governed by and construed in accordance with applicable laws. Any disputes shall be resolved in the appropriate courts.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>9. Contact</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                If you have questions about these Terms of Service, please contact us through the Nostr protocol or via our website.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default Terms;
