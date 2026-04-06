import { Link, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import {
  getTotalRevenue,
  getTotalEnrollments,
  getAverageCompletionRate,
  getAverageQuizPassRate,
  getRevenueTrend,
  getEnrollmentTrend,
  getPerCourseEnrollments,
  getPerCourseCompletionRates,
  getQuizPerformanceByCourse,
} from "~/services/analyticsService";
import type {
  TrendDataPoint,
  Granularity,
  CourseEnrollmentRow,
  CourseCompletionRow,
  CourseQuizPerformanceRow,
} from "~/services/analyticsService";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import {
  AlertTriangle,
  DollarSign,
  Users,
  GraduationCap,
  Target,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

  const serviceOpts = { instructorId: currentUserId, dateRange };

  return {
    totalRevenue: getTotalRevenue(serviceOpts),
    totalEnrollments: getTotalEnrollments(serviceOpts),
    averageCompletionRate: getAverageCompletionRate(serviceOpts),
    averageQuizPassRate: getAverageQuizPassRate(serviceOpts),
    revenueTrend: getRevenueTrend(serviceOpts),
    enrollmentTrend: getEnrollmentTrend(serviceOpts),
    perCourseEnrollments: getPerCourseEnrollments(serviceOpts),
    perCourseCompletionRates: getPerCourseCompletionRates(serviceOpts),
    quizPerformance: getQuizPerformanceByCourse(serviceOpts),
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

// ─── Date Range Picker ───

function DateRangePicker() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const from = searchParams.get("from")?.slice(0, 10) ?? "";
  const to = searchParams.get("to")?.slice(0, 10) ?? "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newFrom = formData.get("from") as string;
    const newTo = formData.get("to") as string;

    const params = new URLSearchParams();
    if (newFrom) params.set("from", `${newFrom}T00:00:00.000Z`);
    if (newTo) params.set("to", `${newTo}T23:59:59.999Z`);

    navigate(`?${params.toString()}`);
  }

  function handleClear() {
    navigate("?");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          type="date"
          id="from"
          name="from"
          defaultValue={from}
          className="w-auto"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          type="date"
          id="to"
          name="to"
          defaultValue={to}
          className="w-auto"
        />
      </div>
      <Button type="submit" size="sm">
        Apply
      </Button>
      {(from || to) && (
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      )}
    </form>
  );
}

// ─── Chart Components ───

function formatGranularityLabel(granularity: Granularity): string {
  switch (granularity) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
  }
}

function RevenueTrendChart(props: {
  data: TrendDataPoint[];
  granularity: Granularity;
}) {
  if (props.data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No revenue data for this period.
      </p>
    );
  }

  const chartData = props.data.map((d) => ({
    period: d.period,
    revenue: d.value / 100,
  }));

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {formatGranularityLabel(props.granularity)} trend
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EnrollmentTrendChart(props: {
  data: TrendDataPoint[];
  granularity: Granularity;
}) {
  if (props.data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No enrollment data for this period.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {formatGranularityLabel(props.granularity)} trend
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={props.data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) => [value, "Enrollments"]}
          />
          <Bar
            dataKey="value"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Table Components ───

function PerCourseEnrollmentTable(props: { data: CourseEnrollmentRow[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No enrollment data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Course</th>
            <th className="pb-2 text-right font-medium">Enrollments</th>
          </tr>
        </thead>
        <tbody>
          {props.data.map((row) => (
            <tr key={row.courseId} className="border-b last:border-0">
              <td className="py-2">{row.courseTitle}</td>
              <td className="py-2 text-right">{row.enrollmentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompletionRatesTable(props: { data: CourseCompletionRow[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No completion data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Course</th>
            <th className="pb-2 text-right font-medium">Enrolled</th>
            <th className="pb-2 text-right font-medium">Completed</th>
            <th className="pb-2 text-right font-medium">Rate</th>
          </tr>
        </thead>
        <tbody>
          {props.data.map((row) => (
            <tr key={row.courseId} className="border-b last:border-0">
              <td className="py-2">{row.courseTitle}</td>
              <td className="py-2 text-right">{row.totalEnrolled}</td>
              <td className="py-2 text-right">{row.completedCount}</td>
              <td className="py-2 text-right font-medium">
                {row.completionRate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuizPerformanceTable(props: { data: CourseQuizPerformanceRow[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No quiz data available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Course</th>
            <th className="pb-2 text-right font-medium">Quizzes</th>
            <th className="pb-2 text-right font-medium">Avg. Pass Rate</th>
            <th className="pb-2 text-right font-medium">Avg. Score</th>
          </tr>
        </thead>
        <tbody>
          {props.data.map((row) => (
            <tr key={row.courseId} className="border-b last:border-0">
              <td className="py-2">{row.courseTitle}</td>
              <td className="py-2 text-right">{row.quizCount}</td>
              <td className="py-2 text-right">{row.averagePassRate}%</td>
              <td className="py-2 text-right">{row.averageScore}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skeleton / Fallback ───

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>
      <div className="mb-8 flex gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-16" />
      </div>
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

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

      {/* Date Range Picker */}
      <div className="mb-8">
        <DateRangePicker />
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Revenue & Enrollment Trend Charts */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Revenue</h2>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(loaderData.totalRevenue)} total
            </p>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart
              data={loaderData.revenueTrend.data}
              granularity={loaderData.revenueTrend.granularity}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Enrollments</h2>
            <p className="text-sm text-muted-foreground">
              {loaderData.totalEnrollments.toLocaleString()} total
            </p>
          </CardHeader>
          <CardContent>
            <EnrollmentTrendChart
              data={loaderData.enrollmentTrend.data}
              granularity={loaderData.enrollmentTrend.granularity}
            />
          </CardContent>
        </Card>
      </div>

      {/* Per-Course Enrollments, Completion Rates, Quiz Performance */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Enrollments by Course</h2>
          </CardHeader>
          <CardContent>
            <PerCourseEnrollmentTable data={loaderData.perCourseEnrollments} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Completion Rates</h2>
          </CardHeader>
          <CardContent>
            <CompletionRatesTable data={loaderData.perCourseCompletionRates} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Quiz Performance</h2>
          </CardHeader>
          <CardContent>
            <QuizPerformanceTable data={loaderData.quizPerformance} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Error Boundary ───

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
