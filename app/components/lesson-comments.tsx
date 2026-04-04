import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";

interface Comment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: number;
  userName: string;
  userAvatarUrl: string | null;
}

interface LessonCommentsProps {
  comments: Comment[];
  currentUserId: number | null;
  canModerate: boolean;
  lessonId: number;
  actionUrl?: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function CommentForm({
  actionUrl,
}: {
  actionUrl?: string;
}) {
  const fetcher = useFetcher();
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setContent("");
      toast.success("Comment posted!");
    }
  }, [fetcher.state, fetcher.data]);

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="space-y-3">
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your thoughts on this lesson..."
        className="min-h-[80px] resize-none"
        maxLength={2000}
        disabled={isSubmitting}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {content.length}/2000
        </span>
        <Button
          size="sm"
          disabled={!content.trim() || isSubmitting}
          onClick={() => {
            fetcher.submit(
              { intent: "add-comment", content: content.trim() },
              { method: "post", ...(actionUrl ? { action: actionUrl } : {}) }
            );
          }}
        >
          <Send className="mr-1.5 size-3.5" />
          {isSubmitting ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  canModerate,
  actionUrl,
}: {
  comment: Comment;
  currentUserId: number | null;
  canModerate: boolean;
  actionUrl?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const editFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const isOwner = currentUserId === comment.userId;
  const canDelete = isOwner || canModerate;
  const isEdited = comment.updatedAt > comment.createdAt;
  const isDeleting = deleteFetcher.state !== "idle";
  const isSavingEdit = editFetcher.state !== "idle";

  useEffect(() => {
    if (editFetcher.state === "idle" && editFetcher.data) {
      setIsEditing(false);
      toast.success("Comment updated!");
    }
  }, [editFetcher.state, editFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      toast.success("Comment deleted.");
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  if (isDeleting) {
    return null;
  }

  return (
    <div className="flex gap-3 py-4">
      <UserAvatar
        name={comment.userName}
        avatarUrl={comment.userAvatarUrl}
        className="mt-0.5 size-8 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.userName}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {isEdited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] resize-none"
              maxLength={2000}
              disabled={isSavingEdit}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!editContent.trim() || isSavingEdit}
                onClick={() => {
                  editFetcher.submit(
                    {
                      intent: "edit-comment",
                      commentId: String(comment.id),
                      content: editContent.trim(),
                    },
                    {
                      method: "post",
                      ...(actionUrl ? { action: actionUrl } : {}),
                    }
                  );
                }}
              >
                {isSavingEdit ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>

            {(isOwner || canDelete) && (
              <div className="mt-2 flex gap-1">
                {isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setEditContent(comment.content);
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="mr-1 size-3" />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="mr-1 size-3" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently
                          delete this comment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => {
                            deleteFetcher.submit(
                              {
                                intent: "delete-comment",
                                commentId: String(comment.id),
                              },
                              {
                                method: "post",
                                ...(actionUrl
                                  ? { action: actionUrl }
                                  : {}),
                              }
                            );
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function LessonComments({
  comments,
  currentUserId,
  canModerate,
  lessonId,
  actionUrl,
}: LessonCommentsProps) {
  return (
    <div className="mt-8 border-t pt-6">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="size-5" />
        <h2 className="text-lg font-semibold">
          Comments{comments.length > 0 ? ` (${comments.length})` : ""}
        </h2>
      </div>

      {!canModerate && currentUserId && (
        <CommentForm actionUrl={actionUrl} />
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No comments yet. Be the first to share your thoughts!
        </p>
      ) : (
        <div className="divide-y">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              canModerate={canModerate}
              actionUrl={actionUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
