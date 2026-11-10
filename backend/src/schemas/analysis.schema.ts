import { z } from 'zod';

export const CONTENT_CATEGORIES = [
  'Education', 'Entertainment', 'Comedy', 'Lifestyle', 'Technology', 'News',
  'Sports', 'Music', 'Dance', 'Food', 'Travel', 'Fashion', 'Beauty', 'Gaming',
  'Art', 'Fitness', 'Business', 'Science', 'Nature', 'Other',
] as const;

export const HUMOUR_STYLES = [
  'Sarcastic', 'Situational', 'Observational', 'Dark', 'Self-deprecating',
  'Absurd', 'Deadpan', 'Parody', 'Wordplay', 'Slapstick', 'Wholesome',
  'Ironic', 'Other',
] as const;

export const MOOD_VALUES = [
  'Informative', 'Curious', 'Positive', 'Calm', 'Excited', 'Playful',
  'Serious', 'Emotional', 'Nostalgic', 'Dramatic', 'Neutral', 'Other',
] as const;

const confidenceSchema = z.number().min(0).max(1);
const weightedNameSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  confidence: confidenceSchema,
});

export const visualModelAnalysisSchema = z.strictObject({
  observations: z.array(z.string().trim().min(1).max(500)).max(20),
  objects: z.array(z.string().trim().min(1).max(100)).max(30),
  activities: z.array(z.string().trim().min(1).max(150)).max(20),
  scenes: z.array(z.string().trim().min(1).max(150)).max(15),
  visibleText: z.array(z.string().trim().min(1).max(300)).max(20),
  context: z.string().trim().max(1000),
});

export const reelContentAnalysisSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1000),
  topics: z.array(weightedNameSchema).max(15),
  interests: z.array(weightedNameSchema).max(15),
  humour: z.strictObject({
    present: z.boolean(),
    style: z.array(z.enum(HUMOUR_STYLES)).max(8),
    confidence: confidenceSchema,
  }),
  mood: z.strictObject({
    primary: z.enum(MOOD_VALUES),
    secondary: z.array(z.enum(MOOD_VALUES)).max(5),
    confidence: confidenceSchema,
  }),
  contentCategory: z.enum(CONTENT_CATEGORIES),
  visualObservations: z.array(z.string().trim().min(1).max(500)).max(20),
  keywords: z.array(z.string().trim().min(1).max(100)).max(30),
  language: z.string().trim().min(1).max(100),
  confidence: confidenceSchema,
});
