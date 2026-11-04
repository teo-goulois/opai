// Sample data for the design system list and canvas. Never real instance data.

export const sampleMarkdown = `## Section

A paragraph with \`inline code\`, **strong text**, and [a link](https://example.com).

- First item
- Second item

\`\`\`sh
pnpm dev
\`\`\`

| Name | Where |
| --- | --- |
| sync | laptop |
`;

export const buttonVariants = ["primary", "secondary", "outline", "ghost", "danger"] as const;
export const badgeVariants = ["neutral", "accent", "success", "warning", "error"] as const;
export const neutrals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const palette = [
  "color-1",
  "color-2",
  "color-3",
  "color-4",
  "success",
  "warning",
  "error",
] as const;
export const textSteps = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;

export const sampleDiff = `diff --git a/content/page.md b/content/page.md
index 0000000..1111111 100644
--- a/content/page.md
+++ b/content/page.md
@@ -1,4 +1,4 @@
 ## Section
 
-An old line that goes away.
+A new line that replaces it.
 A line that stays.
diff --git a/public/page.md b/public/page.md
index 0000000..1111111 100644
--- a/public/page.md
+++ b/public/page.md
@@ -3,2 +3,3 @@
 A line that stays.
+A derived line.
`;
