import z from 'zod';

export const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string(),
});
const configProject = envSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!configProject.success) {
  console.error(configProject);
  console.error(configProject.error.format());
  throw new Error(
    'Các giá trị trong file .env không hợp lệ. Vui lòng kiểm tra lại.',
  );
}

const envConfig = configProject.data;

export default envConfig;
