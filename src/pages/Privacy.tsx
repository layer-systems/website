import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Privacy() {
  useSeoMeta({
    title: 'Privacy Policy - LAYER.systems',
    description: 'Privacy Policy for LAYER.systems Nostr relay',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-bold hover:opacity-80 transition-opacity">
            <Shield className="h-6 w-6" />
            <span>LAYER.systems</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 pb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
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
                LAYER.systems is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you use our Nostr relay service.
              </p>
            </CardContent>
          </Card>

          {/* Information We Collect */}
          <Card>
            <CardHeader>
              <CardTitle>1. Information We Collect</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <h3 className="text-lg font-semibold mt-4">Nostr Events</h3>
              <p>
                As a Nostr relay, we receive and store events published to our service. These events are public by design and include:
              </p>
              <ul>
                <li>Event content and metadata</li>
                <li>Public keys (npub) of event authors</li>
                <li>Timestamps and event signatures</li>
                <li>Tags and references to other events or users</li>
              </ul>

              <h3 className="text-lg font-semibold mt-4">Technical Information</h3>
              <p>
                When you connect to our relay, we may collect:
              </p>
              <ul>
                <li>IP addresses for security and rate limiting purposes</li>
                <li>Connection timestamps</li>
                <li>WebSocket connection metadata</li>
                <li>Request patterns and usage statistics</li>
              </ul>

              <h3 className="text-lg font-semibold mt-4">Website Analytics</h3>
              <p>
                Our website may use analytics tools to understand how users interact with our service. This may include:
              </p>
              <ul>
                <li>Page views and navigation patterns</li>
                <li>Browser type and device information</li>
                <li>Referrer information</li>
              </ul>
            </CardContent>
          </Card>

          {/* How We Use Information */}
          <Card>
            <CardHeader>
              <CardTitle>2. How We Use Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                We use collected information to:
              </p>
              <ul>
                <li>Provide and maintain the relay service</li>
                <li>Improve service performance and reliability</li>
                <li>Prevent abuse, spam, and malicious activity</li>
                <li>Comply with legal obligations</li>
                <li>Analyze usage patterns to improve the service</li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Storage and Security */}
          <Card>
            <CardHeader>
              <CardTitle>3. Data Storage and Security</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                <strong>Public Data:</strong> Events published to our relay are public and may be replicated by other relays in the Nostr network. Once published, events cannot be guaranteed to be deleted from all relays.
              </p>
              <p>
                <strong>Security Measures:</strong> We implement reasonable security measures to protect our infrastructure, including:
              </p>
              <ul>
                <li>Encrypted connections (WSS/TLS)</li>
                <li>Rate limiting and abuse prevention</li>
                <li>Regular security audits</li>
                <li>Secure server configuration</li>
              </ul>
              <p>
                However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </CardContent>
          </Card>

          {/* Data Retention */}
          <Card>
            <CardHeader>
              <CardTitle>4. Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                We retain Nostr events according to our relay policies, which may vary based on:
              </p>
              <ul>
                <li>Event kind and type</li>
                <li>Storage capacity and resource constraints</li>
                <li>Content moderation decisions</li>
                <li>Legal requirements</li>
              </ul>
              <p>
                Technical logs (IP addresses, connection data) are typically retained for 30-90 days for security and operational purposes.
              </p>
            </CardContent>
          </Card>

          {/* Third-Party Services */}
          <Card>
            <CardHeader>
              <CardTitle>5. Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                Our service may interact with third-party services, including:
              </p>
              <ul>
                <li>Other Nostr relays in the network</li>
                <li>Content delivery networks (CDNs)</li>
                <li>Analytics providers</li>
                <li>Infrastructure providers</li>
              </ul>
              <p>
                These third parties have their own privacy policies, and we encourage you to review them.
              </p>
            </CardContent>
          </Card>

          {/* Your Rights */}
          <Card>
            <CardHeader>
              <CardTitle>6. Your Rights and Choices</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                <strong>Content Control:</strong> You control the events you publish. Use deletion events (kind 5) to request deletion of your content, though we cannot guarantee deletion from all relays in the network.
              </p>
              <p>
                <strong>Pseudonymity:</strong> Nostr uses public key cryptography. Your public key (npub) serves as your identity, and you can generate new keys at any time to maintain pseudonymity.
              </p>
              <p>
                <strong>Data Access:</strong> All events published to our relay are publicly queryable through standard Nostr protocols.
              </p>
            </CardContent>
          </Card>

          {/* Cookies and Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>7. Cookies and Tracking</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                Our website uses local storage and may use cookies to:
              </p>
              <ul>
                <li>Store user preferences (theme, settings)</li>
                <li>Maintain login sessions</li>
                <li>Remember relay configurations</li>
              </ul>
              <p>
                You can control cookies through your browser settings. Disabling cookies may affect some functionality.
              </p>
            </CardContent>
          </Card>

          {/* Children's Privacy */}
          <Card>
            <CardHeader>
              <CardTitle>8. Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                Our service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us.
              </p>
            </CardContent>
          </Card>

          {/* International Users */}
          <Card>
            <CardHeader>
              <CardTitle>9. International Users</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                LAYER.systems may be accessed from anywhere in the world. By using our service, you consent to the transfer of your information to our servers, which may be located in different jurisdictions.
              </p>
            </CardContent>
          </Card>

          {/* Changes to Privacy Policy */}
          <Card>
            <CardHeader>
              <CardTitle>10. Changes to This Privacy Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. Your continued use of the service after changes constitutes acceptance of the updated policy.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>11. Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
              <p>
                If you have questions or concerns about this Privacy Policy or our privacy practices, please contact us through the Nostr protocol or via our website.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t text-center space-y-4">
          <div className="flex justify-center gap-6 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Privacy;
