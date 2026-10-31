import { auth } from "@clerk/nextjs/server";
import LandingExperience from "@/components/landing/LandingExperience";

export default async function Home() {
  const { userId } = await auth();
  return <LandingExperience isAuthenticated={Boolean(userId)} />;
}
