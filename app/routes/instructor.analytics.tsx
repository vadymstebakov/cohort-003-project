import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import {
  getTotalRevenue,
  getTotalEnrollments,
  getAverageCompletionRate,
  getAverageQuizPassRate,
} from "~/services/analyticsService";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  AlertTriangle,
  DollarSign,
  Users,
  GraduationCap,
  Target,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "View your course analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors and admins can access this page.", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const dateRange = from || to ? { from, to } : undefined;

  const totalRevenue = getTotalRevenue({
    instructorId: currentUserId,
    dateRange,
  });
  const totalEnrollments = getTotalEnrollments({
    instructorId: currentUserId,
    dateRange,
  });
  const averageCompletionRate = getAverageCompletionRate({
    instructorId: currentUserId,
    dateRange,
  });
  const averageQuizPassRate = getAverageQuizPassRate({
    instructorId: currentUserId,
    dateRange,
  });

  return {
    totalRevenue,
    totalEnrollments,
    averageCompletionRate,
    averageQuizPassRate,
  };
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const summaryCards = [
  {
    title: "Total Revenue",
    icon: DollarSign,
    format: (v: number) => formatCurrency(v),
    key: "totalRevenue" as const,
  },
  {
    title: "Total Enrollments",
    icon: Users,
    format: (v: number) => v.toLocaleString(),
    key: "totalEnrollments" as const,
  },
  {
    title: "Avg. Completion Rate",
    icon: GraduationCap,
    format: (v: number) => `${v}%`,
    key: "averageCompletionRate" as const,
  },
  {
    title: "Avg. Quiz Pass Rate",
    icon: Target,
    format: (v: number) => `${v}%`,
    key: "averageQuizPassRate" as const,
  },
];

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function InstructorAnalytics({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Track performance across all your courses
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {card.title}
              </p>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {card.format(loaderData[card.key])}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
              My Courses
            </button>
          </Link>
          <Link to="/">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Go Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
