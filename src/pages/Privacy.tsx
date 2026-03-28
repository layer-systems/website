import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layout } from '@/components/Layout';

export function Privacy() {
  useSeoMeta({
    title: 'Privacy Policy - LAYER.systems',
    description: 'Privacy Policy for LAYER.systems Nostr relay',
  });

  const sections = [
    {
      title: 'Introduction',
      content: (
        <p>
          LAYER.systems is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you use our Nostr relay service.
        </p>
      ),
    },
    {
      title: '1. Information We Collect',
      content: (
        <>
          <h4 className="mb-2 font-semibold text-foreground">Nostr Events</h4>
          <p>As a Nostr relay, we receive and store events published to our service. These events are public by design and include:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Event content and metadata</li>
            <li>Public keys (npub) of event authors</li>
            <li>Timestamps and event signatures</li>
            <li>Tags and references to other events or users</li>
          </ul>

          <h4 className="mb-2 mt-5 font-semibold text-foreground">Technical Information</h4>
          <p>When you connect to our relay, we may collect:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>IP addresses for security and rate limiting purposes</li>
            <li>Connection timestamps</li>
            <li>WebSocket connection metadata</li>
            <li>Request patterns and usage statistics</li>
          </ul>

          <h4 className="mb-2 mt-5 font-semibold text-foreground">Website Analytics</h4>
          <p>Our website may use analytics tools to understand how users interact with our service. This may include:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Page views and navigation patterns</li>
            <li>Browser type and device information</li>
            <li>Referrer information</li>
          </ul>
        </>
      ),
    },
    {
      title: '2. How We Use Information',
      content: (
        <>
          <p>We use collected information to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Provide and maintain the relay service</li>
            <li>Improve service performance and reliability</li>
            <li>Prevent abuse, spam, and malicious activity</li>
            <li>Comply with legal obligations</li>
            <li>Analyze usage patterns to improve the service</li>
          </ul>
        </>
      ),
    },
    {
      title: '3. Data Storage and Security',
      content: (
        <>
          <p>
            <strong className="text-foreground">Public Data:</strong> Events published to our relay are public and may be replicated by other relays in the Nostr network. Once published, events cannot be guaranteed to be deleted from all relays.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Security Measures:</strong> We implement reasonable security measures to protect our infrastructure, including:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Encrypted connections (WSS/TLS)</li>
            <li>Rate limiting and abuse prevention</li>
            <li>Regular security audits</li>
            <li>Secure server configuration</li>
          </ul>
          <p className="mt-3">
            However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </>
      ),
    },
    {
      title: '4. Data Retention',
      content: (
        <>
          <p>We retain Nostr events according to our relay policies, which may vary based on:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Event kind and type</li>
            <li>Storage capacity and resource constraints</li>
            <li>Content moderation decisions</li>
            <li>Legal requirements</li>
          </ul>
          <p className="mt-3">
            Technical logs (IP addresses, connection data) are typically retained for 30-90 days for security and operational purposes.
          </p>
        </>
      ),
    },
    {
      title: '5. Third-Party Services',
      content: (
        <>
          <p>Our service may interact with third-party services, including:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Other Nostr relays in the network</li>
            <li>Content delivery networks (CDNs)</li>
            <li>Analytics providers</li>
            <li>Infrastructure providers</li>
          </ul>
          <p className="mt-3">These third parties have their own privacy policies, and we encourage you to review them.</p>
        </>
      ),
    },
    {
      title: '6. Your Rights and Choices',
      content: (
        <>
          <p>
            <strong className="text-foreground">Content Control:</strong> You control the events you publish. Use deletion events (kind 5) to request deletion of your content, though we cannot guarantee deletion from all relays in the network.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Pseudonymity:</strong> Nostr uses public key cryptography. Your public key (npub) serves as your identity, and you can generate new keys at any time to maintain pseudonymity.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Data Access:</strong> All events published to our relay are publicly queryable through standard Nostr protocols.
          </p>
        </>
      ),
    },
    {
      title: '7. Cookies and Tracking',
      content: (
        <>
          <p>Our website uses local storage and may use cookies to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Store user preferences (theme, settings)</li>
            <li>Maintain login sessions</li>
            <li>Remember relay configurations</li>
          </ul>
          <p className="mt-3">You can control cookies through your browser settings. Disabling cookies may affect some functionality.</p>
        </>
      ),
    },
    {
      title: '8. Children\'s Privacy',
      content: (
        <p>
          Our service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us.
        </p>
      ),
    },
    {
      title: '9. International Users',
      content: (
        <p>
          LAYER.systems may be accessed from anywhere in the world. By using our service, you consent to the transfer of your information to our servers, which may be located in different jurisdictions.
        </p>
      ),
    },
    {
      title: '10. Changes to This Privacy Policy',
      content: (
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. Your continued use of the service after changes constitutes acceptance of the updated policy.
        </p>
      ),
    },
    {
      title: '11. Contact Us',
      content: (
        <p>
          If you have questions or concerns about this Privacy Policy or our privacy practices, please contact us through the Nostr protocol or via our website.
        </p>
      ),
    },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: December 27, 2025</p>
        </div>

        <div className="space-y-5">
          {sections.map((section, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                {section.content}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default Privacy;
