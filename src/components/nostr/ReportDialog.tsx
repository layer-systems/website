import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useReport, type ReportType } from '@/hooks/useReport';
import { useToast } from '@/hooks/useToast';

const REPORT_TYPE_LABELS: { value: ReportType; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'profanity', label: 'Hateful speech or profanity' },
  { value: 'malware', label: 'Malware or phishing' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
];

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
  /** When set, reports this note; otherwise reports the account. */
  event?: NostrEvent;
  name: string;
}

/** Collects a NIP-56 report type and optional comment, then publishes it. */
export function ReportDialog({ open, onOpenChange, pubkey, event, name }: ReportDialogProps) {
  const [type, setType] = useState<ReportType>('spam');
  const [comment, setComment] = useState('');
  const report = useReport();
  const { toast } = useToast();
  const commentId = useId();

  const handleOpenChange = (next: boolean) => {
    if (!next) setComment('');
    onOpenChange(next);
  };

  const submit = async () => {
    try {
      await report.mutateAsync({ pubkey, event, type, comment: comment.trim() || undefined });
      toast({ title: 'Report sent', description: 'Only the signed report event was published — nothing else was shared.' });
      handleOpenChange(false);
    } catch (error) {
      toast({
        title: 'Could not send the report',
        description: error instanceof Error ? error.message : 'No relay accepted it.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {event ? 'note' : name}</DialogTitle>
          <DialogDescription>
            {event ? `This reports the note from ${name}.` : `This reports ${name}'s account.`} It publishes a
            signed report (NIP-56) that other clients and relays may use for moderation.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={type} onValueChange={(value) => setType(value as ReportType)}>
          {REPORT_TYPE_LABELS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={option.value} />
              {option.label}
            </label>
          ))}
        </RadioGroup>

        <div className="space-y-1.5">
          <Label htmlFor={commentId}>Additional context (optional)</Label>
          <Textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share only what's necessary to explain the report."
            maxLength={500}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={report.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={report.isPending} className="gap-1.5">
            {report.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
