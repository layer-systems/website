import { useSeoMeta } from '@unhead/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layout } from '@/components/Layout';

export function Terms() {
  useSeoMeta({
    title: 'Terms of Service - LAYER.systems',
    description: 'Terms of Service for LAYER.systems Nostr relay',
  });

  const sections = [
    {
      title: 'Introduction',
      content: (
        <p>
          Welcome to LAYER.systems. By accessing and using our Nostr relay service, you agree to be bound by these Terms of Service. Please read them carefully.
        </p>
      ),
    },
    {
      title: '1. Service Description',
      content: (
        <>
          <p>
            LAYER.systems provides a public Nostr relay service that allows users to publish and query events on the Nostr protocol. The service is provided "as is" and we make no guarantees about uptime, data persistence, or availability.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>The relay may be temporarily unavailable due to maintenance or technical issues</li>
            <li>Events may be deleted or modified at our discretion</li>
            <li>We reserve the right to refuse service to any user</li>
          </ul>
        </>
      ),
    },
    {
      title: '2. User Conduct',
      content: (
        <>
          <p>By using LAYER.systems, you agree not to:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Publish illegal content or content that violates applicable laws</li>
            <li>Engage in spam, phishing, or other abusive behaviors</li>
            <li>Attempt to disrupt or compromise the security of the relay</li>
            <li>Use the service to harass, threaten, or harm others</li>
            <li>Impersonate others or misrepresent your identity</li>
            <li>Violate intellectual property rights</li>
          </ul>
          <p className="mt-3">We reserve the right to remove content and ban users who violate these terms.</p>
        </>
      ),
    },
    {
      title: '3. Content Policy',
      content: (
        <>
          <p>
            You retain all rights to content you publish through our relay. However, by publishing content, you grant us a non-exclusive, worldwide license to store, cache, and distribute your content as necessary to operate the service.
          </p>
          <p className="mt-3">We may remove content that:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Violates applicable laws or regulations</li>
            <li>Infringes on intellectual property rights</li>
            <li>Contains malware or malicious code</li>
            <li>Violates our content policies</li>
          </ul>
        </>
      ),
    },
    {
      title: '4. Limitation of Liability',
      content: (
        <>
          <p>
            LAYER.systems is provided "as is" without warranties of any kind. To the fullest extent permitted by law, we disclaim all warranties, express or implied.
          </p>
          <p className="mt-3">We are not liable for:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Any data loss or corruption</li>
            <li>Service interruptions or downtime</li>
            <li>Content published by users</li>
            <li>Indirect, incidental, or consequential damages</li>
            <li>Loss of profits or revenue</li>
          </ul>
        </>
      ),
    },
    {
      title: '5. Privacy',
      content: (
        <p>
          Your use of LAYER.systems is also governed by our{' '}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
          . Please review it to understand how we collect and use information.
        </p>
      ),
    },
    {
      title: '6. Changes to Terms',
      content: (
        <p>
          We reserve the right to modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your continued use of the service after changes constitutes acceptance of the modified terms.
        </p>
      ),
    },
    {
      title: '7. Termination',
      content: (
        <p>
          We may terminate or suspend your access to the service at any time, without prior notice, for any reason, including violation of these Terms of Service.
        </p>
      ),
    },
    {
      title: '8. Governing Law',
      content: (
        <p>
          These Terms of Service are governed by and construed in accordance with applicable laws. Any disputes shall be resolved in the appropriate courts.
        </p>
      ),
    },
    {
      title: '9. Contact',
      content: (
        <p>
          If you have questions about these Terms of Service, please contact us through the Nostr protocol or via our website.
        </p>
      ),
    },
  ];

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">Terms of Service</h1>
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

export default Terms;
