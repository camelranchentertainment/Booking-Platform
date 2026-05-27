import { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_TEMPLATES = [
  {
    category: 'initial_outreach',
    subject:  'Booking Inquiry — {{venue_name}} — {{season}} {{year}}',
    body: `Hi {{booking_contact}},

My name is [Your Name] and I represent {{act_name}}. We're a touring music act currently booking dates in the {{city}} area for {{season}} {{year}}.

We'd love to discuss the possibility of performing at {{venue_name}}. We bring an engaged following and a professionally produced set.

Would you be open to a conversation about availability and terms?

Best,
[Your Name]
{{act_name}}
{{phone}}
{{email}}`,
  },
  {
    category: 'follow_up',
    subject:  'Following Up — {{act_name}} Booking Inquiry',
    body: `Hi {{booking_contact}},

I wanted to follow up on my recent inquiry about booking {{act_name}} at {{venue_name}}.

We're still very interested in performing at your venue and would love to discuss details at your convenience.

Please feel free to reach me at {{email}} or {{phone}}.

Thank you for your time,
[Your Name]
{{act_name}}`,
  },
  {
    category: 'confirmation',
    subject:  'Booking Confirmation — {{act_name}} at {{venue_name}} — {{show_date}}',
    body: `Hi {{booking_contact}},

Thank you for confirming! This email serves as our mutual confirmation of the following booking:

Act: {{act_name}}
Venue: {{venue_name}}
Date: {{show_date}}
Set Time: {{set_time}}
Compensation: {{pay_terms}}

We look forward to performing at {{venue_name}} and will be in touch closer to the date with any logistics questions.

Best,
[Your Name]
{{act_name}}
{{phone}}`,
  },
];

export async function seedDefaultTemplates(client: SupabaseClient, actId: string): Promise<void> {
  for (const tmpl of DEFAULT_TEMPLATES) {
    await client
      .from('email_templates')
      .upsert(
        {
          act_id:   actId,
          category: tmpl.category,
          subject:  tmpl.subject,
          body:     tmpl.body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'act_id,category', ignoreDuplicates: true },
      );
  }
}
