import { notFound } from "next/navigation";

/**
 * The site root is intentionally empty. Visitors use /inquiries, investors use
 * /portal and staff use /admin. The root returns 404 with the friendly page in
 * not-found.tsx.
 */
export default function Home() {
  notFound();
}
