import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/AuthContext"
import { sendChat, createRecord, type ChatMessage, type BorrowDraft } from "@/api"

type DraftState = "idle" | "sending" | "sent" | "dismissed"

interface UiMessage extends ChatMessage {
  id: number
  draft?: BorrowDraft
  draftState?: DraftState
  draftError?: string
}

const STORAGE_KEY = "chatwidget_messages"
const OPEN_KEY = "chatwidget_open"

function saveMessages(msgs: UiMessage[]) {
  try {
    // Chỉ lưu role + content, bỏ draft (không serialize được sạch)
    const slim = msgs.map(({ id, role, content }) => ({ id, role, content }))
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {}
}

function loadMessages(): UiMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

const SUGGESTIONS = [
  "Bài Áp suất chất lỏng (Vật lí 8) cần thiết bị gì?",
  "Kính hiển vi còn trống vào thứ Sáu tuần sau không?",
  "Trả thiết bị trễ thì bị xử lý thế nào?",
]

/** Hiển thị **đậm** trong câu trả lời, giữ nguyên xuống dòng. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.length > 4 && part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function DraftCard({
  msg, onSend, onDismiss, onFill,
}: { msg: UiMessage; onSend: () => void; onDismiss: () => void; onFill?: () => void }) {
  const d = msg.draft!
  const missing = d.missing ?? []
  const complete = missing.length === 0
  const blank = "(chưa có)"
  const rows: [string, string][] = [
    ["Môn", d.subjectName],
    ["Giáo viên", d.teacherName || blank],
    ["Lớp", d.className || blank],
    ["Ngày mượn", d.borrowDate === d.returnDate ? d.borrowDate : `${d.borrowDate} đến ${d.returnDate}`],
    ["Tiết", `${d.period || blank} (PPCT: ${d.periodPPCT || blank})`],
    ["Thiết bị", d.equipment],
  ]
  if (d.notes) rows.push(["Ghi chú", d.notes])

  if (msg.draftState === "dismissed") {
    return <p className="mt-2 text-xs text-gray-400">Đã bỏ bản nháp này.</p>
  }
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold text-[#1a3670] mb-2">Bản nháp phiếu mượn</p>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="text-gray-800 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {msg.draftState === "sent" ? (
        <p className="mt-3 text-xs font-medium text-emerald-700">Đã gửi. Yêu cầu đang chờ quản trị viên duyệt.</p>
      ) : (
        <>
          {msg.draftError && <p role="alert" className="mt-2 text-xs text-red-600">{msg.draftError}</p>}
          {!complete && (
            <p className="mt-2 text-xs text-amber-700">
              Còn thiếu: {missing.join(", ")}. Bấm "Điền vào form" để điền nốt, hoặc trả lời trợ lý để bổ sung.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {onFill && (
              <button
                onClick={onFill}
                disabled={msg.draftState === "sending"}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${complete ? "border border-[#1a3670] text-[#1a3670] hover:bg-white" : "bg-[#1a3670] text-white hover:bg-[#15295a]"}`}
                title="Đưa thông tin vào form đăng ký để kiểm tra và sửa trước khi gửi"
              >
                Điền vào form
              </button>
            )}
            {complete && (
              <button
                onClick={onSend}
                disabled={msg.draftState === "sending"}
                className="flex-1 rounded-lg bg-[#1a3670] px-3 py-2 text-xs font-semibold text-white hover:bg-[#15295a] disabled:opacity-60"
              >
                {msg.draftState === "sending" ? "Đang gửi..." : "Gửi yêu cầu"}
              </button>
            )}
            <button
              onClick={onDismiss}
              disabled={msg.draftState === "sending"}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-white disabled:opacity-60"
            >
              Bỏ
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function ChatWidget({
  subjectId,
  onRecordCreated,
  onFillForm,
}: {
  subjectId?: string
  onRecordCreated?: () => void
  /** Đưa bản nháp vào form đăng ký của trang môn học */
  onFillForm?: (draft: BorrowDraft) => void
}) {
  const { user, login } = useAuth()
  const [open, setOpen] = useState(() => sessionStorage.getItem(OPEN_KEY) === "1")
  const [messages, setMessages] = useState<UiMessage[]>(() => loadMessages())
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [messages, loading, error, open])
  useEffect(() => { if (open && user) inputRef.current?.focus() }, [open, user])
  useEffect(() => { saveMessages(messages) }, [messages])
  useEffect(() => { sessionStorage.setItem(OPEN_KEY, open ? "1" : "0") }, [open])

  const patch = (id: number, changes: Partial<UiMessage>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)))

  const run = async (history: UiMessage[]) => {
    setLoading(true)
    setError("")
    try {
      const payload: ChatMessage[] = history.map(({ role, content }) => ({ role, content }))
      const { reply, draft } = await sendChat(payload, { subjectId })
      setMessages((list) => [
        ...list,
        { id: nextId.current++, role: "assistant", content: reply, draft: draft ?? undefined, draftState: draft ? "idle" : undefined },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể gửi tin nhắn")
    } finally {
      setLoading(false)
    }
  }

  const submit = (text: string) => {
    const content = text.trim()
    if (!content || loading) return
    const next: UiMessage[] = [...messages, { id: nextId.current++, role: "user", content }]
    setMessages(next)
    setInput("")
    run(next)
  }

  const sendDraft = async (id: number) => {
    const draft = messages.find((m) => m.id === id)?.draft
    if (!draft) return
    patch(id, { draftState: "sending", draftError: undefined })
    try {
      await createRecord(draft)
      patch(id, { draftState: "sent" })
      onRecordCreated?.()
    } catch (e) {
      patch(id, { draftState: "idle", draftError: e instanceof Error ? e.message : "Không thể gửi yêu cầu" })
    }
  }

  const close = () => { setOpen(false); toggleRef.current?.focus() }

  const fillForm = (draft: BorrowDraft) => {
    onFillForm?.(draft)
    // Màn hình nhỏ: khung chat che mất form nên đóng lại
    if (window.innerWidth < 1024) setOpen(false)
  }

  return (
    <>
      <button
        ref={toggleRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Đóng trợ lý thiết bị" : "Mở trợ lý thiết bị"}
        aria-expanded={open}
        className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a3670] text-white shadow-lg hover:bg-[#15295a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3670]"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m-9 6l2.5-3H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v14z" /></svg>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Trợ lý thiết bị"
          onKeyDown={(e) => { if (e.key === "Escape") close() }}
          className="fixed bottom-24 left-3 right-3 z-50 flex h-[min(34rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:left-5 sm:right-auto sm:w-[23.5rem]"
        >
          <div className="bg-[#1a3670] px-4 py-3 text-white">
            <p className="text-sm font-bold">Trợ lý thiết bị</p>
            <p className="text-xs text-white/70">Tìm thiết bị, gợi ý theo bài dạy, soạn phiếu mượn</p>
          </div>

          {!user ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-semibold text-gray-800">Đăng nhập để dùng trợ lý</p>
              <p className="mt-1 mb-4 text-xs text-gray-500">Trợ lý cần biết bạn là ai để soạn phiếu mượn đúng tên.</p>
              <button onClick={login} className="rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:border-[#1a3670] hover:text-[#1a3670]">
                Đăng nhập bằng Google
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3" role="log" aria-live="polite" aria-label="Cuộc trò chuyện">
                {messages.length === 0 && (
                  <div>
                    <p className="mb-2 text-xs text-gray-500">Bạn có thể hỏi, ví dụ:</p>
                    <div className="flex flex-col gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => submit(s)} className="rounded-xl border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 hover:border-[#1a3670] hover:text-[#1a3670]">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#1a3670] px-3 py-2 text-sm text-white" : "max-w-[92%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"}>
                      <p className="whitespace-pre-wrap break-words"><Rich text={m.content} /></p>
                      {m.draft && (
                        <DraftCard
                          msg={m}
                          onSend={() => sendDraft(m.id)}
                          onDismiss={() => patch(m.id, { draftState: "dismissed" })}
                          onFill={onFillForm && m.draft ? () => fillForm(m.draft!) : undefined}
                        />
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start" aria-label="Trợ lý đang soạn câu trả lời">
                    <div className="flex gap-1 rounded-2xl rounded-bl-md border border-gray-200 px-3 py-3">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}{" "}
                    <button onClick={() => run(messages)} disabled={loading} className="font-semibold underline">Thử lại</button>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); submit(input) }}
                className="border-t border-gray-100 p-3"
              >
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={2}
                    maxLength={500}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input) }
                    }}
                    placeholder="Nhập câu hỏi..."
                    aria-label="Tin nhắn"
                    className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#1a3670] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    aria-label="Gửi tin nhắn"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a3670] text-white hover:bg-[#15295a] disabled:opacity-40"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-6 6m6-6l6 6" /></svg>
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Trợ lý AI có thể nhầm. Hãy kiểm tra phiếu trước khi gửi.</p>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
