'use server';

/**
 * @fileOverview AI-powered profile summary generator.
 *
 * - generateProfileSummary - A function that generates a profile summary based on user bio and recent posts.
 * - GenerateProfileSummaryInput - The input type for the generateProfileSummary function.
 * - GenerateProfileSummaryOutput - The return type for the generateProfileSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateProfileSummaryInputSchema = z.object({
  bio: z.string().describe('The user bio.'),
  recentPosts: z.array(z.string()).describe('The user recent posts.'),
});
export type GenerateProfileSummaryInput = z.infer<
  typeof GenerateProfileSummaryInputSchema
>;

const GenerateProfileSummaryOutputSchema = z.object({
  summary: z.string().describe('The AI-generated profile summary.'),
});
export type GenerateProfileSummaryOutput = z.infer<
  typeof GenerateProfileSummaryOutputSchema
>;

export async function generateProfileSummary(
  input: GenerateProfileSummaryInput
): Promise<GenerateProfileSummaryOutput> {
  return generateProfileSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateProfileSummaryPrompt',
  input: {schema: GenerateProfileSummaryInputSchema},
  output: {schema: GenerateProfileSummaryOutputSchema},
  prompt: `You are an AI assistant that generates brief profile summaries for social media users.

  Based on the following user bio and recent posts, create a concise summary of their interests and content.

  Bio: {{{bio}}}
  Recent Posts:
  {{#each recentPosts}}
  - {{{this}}}
  {{/each}}
  `,
});

const generateProfileSummaryFlow = ai.defineFlow(
  {
    name: 'generateProfileSummaryFlow',
    inputSchema: GenerateProfileSummaryInputSchema,
    outputSchema: GenerateProfileSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
