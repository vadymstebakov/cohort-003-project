import { Link, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById, getUsersByRole } from "~/services/userService";
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
  getDropOffAnalysis,
} from "~/services/analyticsService";
import type {
  TrendDataPoint,
  Granularity,
  CourseEnrollmentRow,
  CourseCompletionRow,
  CourseQuizPerformanceRow,
  CourseDropOffData,
  LessonFunnelRow,
  ModuleFunnelRow,
  StudentSegmentCounts,
} from "~/services/analyticsService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  DollarSign,
  Users,
  GraduationCap,
  Target,
  TrendingDown,
} from "lucide-react";
import { data, isRouteErrorResponse } from "react-router";
import { UserRole } from "~/db/schema";
import { useState } from "react";
import { LineChart, Line, BarChart, Bar } from "recharts";
import {
  ChartTooltip,
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
  ChartContainer,
} from "~/components/ui/chart";

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

  const isAdmin = user.role === UserRole.Admin;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const dateRange = from || to ? { from, to } : undefined;

  // Admins can view any instructor's data via the instructorId search param
  let targetInstructorId = currentUserId;
  const instructors = isAdmin ? getUsersByRole(UserRole.Instructor) : [];

  if (isAdmin) {
    const selectedId = url.searchParams.get("instructorId");
    if (selectedId) {
      const parsed = Number(selectedId);
      if (!Number.isNaN(parsed) && instructors.some((i) => i.id === parsed)) {
        targetInstructorId = parsed;
      }
    } else if (instructors.length > 0) {
      // Default to the first instructor if admin hasn't selected one
      targetInstructorId = instructors[0].id;
    }
  }

  const serviceOpts = { instructorId: targetInstructorId, dateRange };
  const now = new Date().toISOString();

  return {
    isAdmin,
    instructors,
    selectedInstructorId: targetInstructorId,
    totalRevenue: getTotalRevenue(serviceOpts),
    totalEnrollments: getTotalEnrollments(serviceOpts),
    averageCompletionRate: getAverageCompletionRate(serviceOpts),
    averageQuizPassRate: getAverageQuizPassRate(serviceOpts),
    revenueTrend: getRevenueTrend(serviceOpts),
    enrollmentTrend: getEnrollmentTrend(serviceOpts),
    perCourseEnrollments: getPerCourseEnrollments(serviceOpts),
    perCourseCompletionRates: getPerCourseCompletionRates(serviceOpts),
    quizPerformance: getQuizPerformanceByCourse(serviceOpts),
    dropOffAnalysis: getDropOffAnalysis({ ...serviceOpts, now }),
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

    const params = new URLSearchParams(searchParams);
    params.delete("from");
    params.delete("to");
    if (newFrom) params.set("from", `${newFrom}T00:00:00.000Z`);
    if (newTo) params.set("to", `${newTo}T23:59:59.999Z`);

    navigate(`?${params.toString()}`);
  }

  function handleClear() {
    const params = new URLSearchParams(searchParams);
    params.delete("from");
    params.delete("to");
    navigate(`?${params.toString()}`);
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

// ─── Instructor Selector (Admin only) ───

function InstructorSelector(props: {
  instructors: { id: number; name: string }[];
  selectedId: number;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("instructorId", value);
    navigate(`?${params.toString()}`);
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        Viewing as instructor
      </Label>
      <Select
        value={String(props.selectedId)}
        onValueChange={handleChange}
      >
        <SelectTrigger className="w-[240px]">
          <SelectValue placeholder="Select instructor…" />
        </SelectTrigger>
        <SelectContent>
          {props.instructors.map((instructor) => (
            <SelectItem key={instructor.id} value={String(instructor.id)}>
              {instructor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
      <ChartContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <ChartGrid />
          <ChartXAxis dataKey="period" />
          <ChartYAxis tickFormatter={(v: number) => `$${v}`} />
          <ChartTooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            className="stroke-chart-1"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ChartContainer>
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
      <ChartContainer width="100%" height={300}>
        <BarChart data={props.data}>
          <ChartGrid />
          <ChartXAxis dataKey="period" />
          <ChartYAxis allowDecimals={false} />
          <ChartTooltip
            formatter={(value) => [value, "Enrollments"]}
          />
          <Bar
            dataKey="value"
            className="fill-chart-2"
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
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

// ─── Drop-off Analysis Components ───

const SEGMENT_COLORS = {
  neverStarted: "hsl(var(--muted-foreground))",
  inProgress: "hsl(210, 80%, 55%)",
  abandoned: "hsl(0, 70%, 55%)",
  completed: "hsl(145, 65%, 42%)",
};

function LessonFunnelChart(props: { data: LessonFunnelRow[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No lesson data available.
      </p>
    );
  }

  const chartData = props.data.map((d) => ({
    name: d.lessonTitle,
    percent: d.completionPercent,
  }));

  return (
    <ChartContainer width="100%" height={Math.max(200, props.data.length * 40)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <ChartGrid />
        <ChartXAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartYAxis type="category" dataKey="name" width={120} />
        <ChartTooltip formatter={(value) => [`${value}%`, "Completed"]} />
        <Bar dataKey="percent" className="fill-chart-1" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function ModuleFunnelChart(props: { data: ModuleFunnelRow[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No module data available.
      </p>
    );
  }

  const chartData = props.data.map((d) => ({
    name: d.moduleTitle,
    percent: d.completionPercent,
  }));

  return (
    <ChartContainer width="100%" height={Math.max(200, props.data.length * 50)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <ChartGrid />
        <ChartXAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartYAxis type="category" dataKey="name" width={120} />
        <ChartTooltip formatter={(value) => [`${value}%`, "Completed"]} />
        <Bar dataKey="percent" className="fill-chart-1" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function StudentSegmentsDisplay(props: { segments: StudentSegmentCounts }) {
  const { segments } = props;

  if (segments.total === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No enrollment data available.
      </p>
    );
  }

  const items = [
    { label: "Never Started", count: segments.neverStarted, color: SEGMENT_COLORS.neverStarted },
    { label: "In Progress", count: segments.inProgress, color: SEGMENT_COLORS.inProgress },
    { label: "Abandoned", count: segments.abandoned, color: SEGMENT_COLORS.abandoned },
    { label: "Completed", count: segments.completed, color: SEGMENT_COLORS.completed },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3 text-center">
          <div
            className="mx-auto mb-1 size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <div className="text-lg font-bold">{item.count}</div>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="text-xs text-muted-foreground">
            {segments.total > 0
              ? `${Math.round((item.count / segments.total) * 100)}%`
              : "0%"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CourseDropOffCard(props: { data: CourseDropOffData }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = props;

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between p-6 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="text-base font-semibold">{data.courseTitle}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.segments.total} enrolled &middot; {data.dropOffRate}% drop-off
            rate
          </p>
        </div>
        <ChevronDown
          className={`size-5 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <CardContent className="space-y-6 border-t pt-6">
          <div>
            <h4 className="mb-3 text-sm font-medium">Student Segments</h4>
            <StudentSegmentsDisplay segments={data.segments} />
          </div>

          <div>
            <h4 className="mb-3 text-sm font-medium">Lesson-by-Lesson Funnel</h4>
            <LessonFunnelChart data={data.lessonFunnel} />
          </div>

          <div>
            <h4 className="mb-3 text-sm font-medium">Module-Level Funnel</h4>
            <ModuleFunnelChart data={data.moduleFunnel} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function DropOffAnalysisSection(props: { data: CourseDropOffData[] }) {
  if (props.data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No course data available for drop-off analysis.
      </p>
    );
  }

  // Find course with highest drop-off rate
  const highestDropOff = props.data.reduce((max, course) =>
    course.dropOffRate > max.dropOffRate ? course : max
  );

  return (
    <div className="space-y-4">
      {highestDropOff.dropOffRate > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <TrendingDown className="size-4 shrink-0 text-destructive" />
          <span>
            <strong>{highestDropOff.courseTitle}</strong> has the highest drop-off
            rate at {highestDropOff.dropOffRate}%
          </span>
        </div>
      )}

      {props.data.map((course) => (
        <CourseDropOffCard key={course.courseId} data={course} />
      ))}
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

      {/* Admin Instructor Selector + Date Range Picker */}
      <div className="mb-8 flex flex-wrap items-end gap-6">
        {loaderData.isAdmin && loaderData.instructors.length > 0 && (
          <InstructorSelector
            instructors={loaderData.instructors}
            selectedId={loaderData.selectedInstructorId}
          />
        )}
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
      <div className="mb-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
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

      {/* Drop-off Analysis */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Drop-off Analysis</h2>
        <DropOffAnalysisSection data={loaderData.dropOffAnalysis} />
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
