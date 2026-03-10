"""Textual TUI for emcom interactive mode."""

from __future__ import annotations

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import (
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    Static,
    TabbedContent,
    TabPane,
    TextArea,
)

from emcom.client import EmcomClient, EmcomError
from emcom.formatting import short_date
from emcom.models import Email, Thread


# ---------------------------------------------------------------------------
# Compose / Reply / Who modals
# ---------------------------------------------------------------------------

class ComposeScreen(ModalScreen[Email | None]):
    """Modal for composing a new email."""

    DEFAULT_CSS = """
    ComposeScreen {
        align: center middle;
    }
    ComposeScreen > Vertical {
        width: 70;
        height: auto;
        max-height: 80%;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    ComposeScreen Input {
        margin-bottom: 1;
    }
    ComposeScreen TextArea {
        height: 10;
        margin-bottom: 1;
    }
    ComposeScreen .btn-row {
        height: 1;
        align: right middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel"),
    ]

    def __init__(self, client: EmcomClient) -> None:
        super().__init__()
        self.client = client

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Compose New Email", classes="title")
            yield Input(placeholder="To (comma-separated)", id="to")
            yield Input(placeholder="Subject", id="subject")
            yield TextArea(id="body")
            yield Label("[Enter in body to type] Tab between fields | Escape=Cancel | Ctrl+S=Send", classes="btn-row")

    def key_ctrl_s(self) -> None:
        self._do_send()

    @work(thread=True)
    def _do_send(self) -> None:
        to_val = self.query_one("#to", Input).value.strip()
        subject_val = self.query_one("#subject", Input).value.strip()
        body_val = self.query_one("#body", TextArea).text.strip()
        if not to_val or not subject_val:
            self.app.call_from_thread(self.notify, "To and Subject are required", severity="error")
            return
        recipients = [r.strip() for r in to_val.split(",") if r.strip()]
        try:
            email = self.client.send(to=recipients, subject=subject_val, body=body_val)
            self.app.call_from_thread(self.dismiss, email)
        except EmcomError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")

    def action_cancel(self) -> None:
        self.dismiss(None)


class ReplyScreen(ModalScreen[Email | None]):
    """Modal for replying to an email."""

    DEFAULT_CSS = """
    ReplyScreen {
        align: center middle;
    }
    ReplyScreen > Vertical {
        width: 70;
        height: auto;
        max-height: 80%;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    ReplyScreen TextArea {
        height: 10;
        margin-bottom: 1;
    }
    ReplyScreen .btn-row {
        height: 1;
        align: right middle;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel"),
    ]

    def __init__(self, client: EmcomClient, original: Email) -> None:
        super().__init__()
        self.client = client
        self.original = original

    def compose(self) -> ComposeResult:
        o = self.original
        with Vertical():
            yield Label(f"Reply to: {o.sender} — {o.subject}", classes="title")
            yield Static(
                f"From: {o.sender}  To: {', '.join(o.to)}\n"
                f"Date: {short_date(o.created_at)}\n\n"
                f"{o.body[:300]}{'...' if len(o.body) > 300 else ''}",
                classes="original",
            )
            yield TextArea(id="body")
            yield Label("Escape=Cancel | Ctrl+S=Send", classes="btn-row")

    def key_ctrl_s(self) -> None:
        self._do_reply()

    @work(thread=True)
    def _do_reply(self) -> None:
        body_val = self.query_one("#body", TextArea).text.strip()
        if not body_val:
            self.app.call_from_thread(self.notify, "Reply body is empty", severity="warning")
            return
        try:
            email = self.client.reply(self.original.id, body=body_val)
            self.app.call_from_thread(self.dismiss, email)
        except EmcomError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")

    def action_cancel(self) -> None:
        self.dismiss(None)


class WhoScreen(ModalScreen[None]):
    """Modal showing registered identities."""

    DEFAULT_CSS = """
    WhoScreen {
        align: center middle;
    }
    WhoScreen > Vertical {
        width: 80;
        height: auto;
        max-height: 80%;
        border: thick $accent;
        background: $surface;
        padding: 1 2;
    }
    WhoScreen DataTable {
        height: auto;
        max-height: 20;
    }
    WhoScreen .btn-row {
        height: 1;
        align: right middle;
    }
    """

    BINDINGS = [
        Binding("escape", "close", "Close"),
    ]

    def __init__(self, client: EmcomClient) -> None:
        super().__init__()
        self.client = client

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Who's Online")
            yield DataTable(id="who-table")
            yield Label("Escape=Close", classes="btn-row")

    def on_mount(self) -> None:
        self._load_who()

    @work(thread=True)
    def _load_who(self) -> None:
        try:
            identities = self.client.who()
            self.app.call_from_thread(self._populate, identities)
        except EmcomError as e:
            self.app.call_from_thread(self.notify, str(e), severity="error")

    def _populate(self, identities) -> None:
        table = self.query_one("#who-table", DataTable)
        table.clear(columns=True)
        table.add_columns("Name", "Description", "Location", "Last Seen")
        for i in identities:
            table.add_row(i.name, i.description[:40], i.location[:25], short_date(i.last_seen))

    def action_close(self) -> None:
        self.dismiss(None)


# ---------------------------------------------------------------------------
# Main App
# ---------------------------------------------------------------------------

class EmcomApp(App):
    """Textual TUI for emcom email messaging."""

    TITLE = "emcom"

    DEFAULT_CSS = """
    #main {
        height: 1fr;
        layout: grid;
        grid-size: 1 2;
        grid-rows: 3fr 2fr;
    }

    .email-table {
        height: 1fr;
    }

    #preview-box {
        min-height: 6;
        border-top: solid $accent;
    }

    #preview {
        padding: 0 1;
    }
    """

    BINDINGS = [
        Binding("1", "tab('inbox')", "Inbox", show=True),
        Binding("2", "tab('sent')", "Sent", show=True),
        Binding("3", "tab('all')", "All", show=True),
        Binding("4", "tab('threads')", "Threads", show=True),
        Binding("left", "tab_prev", "Prev Tab", show=False),
        Binding("right", "tab_next", "Next Tab", show=False),
        Binding("j", "cursor_down", "Down", show=False),
        Binding("k", "cursor_up", "Up", show=False),
        Binding("r", "reply", "Reply", show=True),
        Binding("c", "compose", "Compose", show=True),
        Binding("w", "who", "Who", show=True),
        Binding("f5", "refresh", "Refresh", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]

    def __init__(self, client: EmcomClient) -> None:
        super().__init__()
        self.client = client
        # Current email list for each tab, keyed by tab id
        self._tab_emails: dict[str, list[Email]] = {}
        self._tab_threads: dict[str, list[Thread]] = {}

    def compose(self) -> ComposeResult:
        name = self.client.name or "unregistered"
        yield Header()
        with Container(id="main"):
            with TabbedContent("Inbox", "Sent", "All", "Threads", id="tabs"):
                with TabPane("Inbox", id="inbox"):
                    yield DataTable(id="table-inbox", classes="email-table", cursor_type="row")
                with TabPane("Sent", id="sent"):
                    yield DataTable(id="table-sent", classes="email-table", cursor_type="row")
                with TabPane("All", id="all"):
                    yield DataTable(id="table-all", classes="email-table", cursor_type="row")
                with TabPane("Threads", id="threads"):
                    yield DataTable(id="table-threads", classes="email-table", cursor_type="row")
            with VerticalScroll(id="preview-box"):
                yield Static("Select an email to preview", id="preview")
        yield Footer()

    def on_mount(self) -> None:
        name = self.client.name or "unregistered"
        self.title = f"emcom ({name})"
        self._setup_email_table("table-inbox")
        self._setup_email_table("table-sent", sent=True)
        self._setup_email_table("table-all")
        self._setup_thread_table("table-threads")
        self._load_tab("inbox")
        self.query_one("#table-inbox", DataTable).focus()

    def _setup_email_table(self, table_id: str, sent: bool = False) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        if sent:
            table.add_columns("To", "Subject", "Date", "Tags")
        else:
            table.add_columns("From", "Subject", "Date", "Tags")

    def _setup_thread_table(self, table_id: str) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.add_columns("Subject", "Participants", "Emails", "Last Activity")

    # --- Tab switching ---

    TAB_ORDER = ["inbox", "sent", "all", "threads"]

    def action_tab_prev(self) -> None:
        current = self._active_tab()
        idx = self.TAB_ORDER.index(current) if current in self.TAB_ORDER else 0
        self.action_tab(self.TAB_ORDER[(idx - 1) % len(self.TAB_ORDER)])

    def action_tab_next(self) -> None:
        current = self._active_tab()
        idx = self.TAB_ORDER.index(current) if current in self.TAB_ORDER else 0
        self.action_tab(self.TAB_ORDER[(idx + 1) % len(self.TAB_ORDER)])

    def action_tab(self, tab_id: str) -> None:
        tabs = self.query_one("#tabs", TabbedContent)
        tabs.active = tab_id
        self._load_tab(tab_id)
        self.query_one(f"#table-{tab_id}", DataTable).focus()

    def on_tabbed_content_tab_activated(self, event: TabbedContent.TabActivated) -> None:
        tab_id = event.pane.id
        if tab_id:
            self._load_tab(tab_id)

    # --- Data loading ---

    def _load_tab(self, tab_id: str) -> None:
        if tab_id == "inbox":
            self._load_inbox()
        elif tab_id == "sent":
            self._load_sent()
        elif tab_id == "all":
            self._load_all()
        elif tab_id == "threads":
            self._load_threads()

    @work(thread=True)
    def _load_inbox(self) -> None:
        try:
            emails = self.client.inbox()
            self.call_from_thread(self._populate_email_table, "table-inbox", "inbox", emails)
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    @work(thread=True)
    def _load_sent(self) -> None:
        try:
            emails = self.client.sent()
            self.call_from_thread(self._populate_email_table, "table-sent", "sent", emails, sent=True)
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    @work(thread=True)
    def _load_all(self) -> None:
        try:
            emails = self.client.all_mail()
            self.call_from_thread(self._populate_email_table, "table-all", "all", emails)
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    @work(thread=True)
    def _load_threads(self) -> None:
        try:
            threads = self.client.threads()
            self.call_from_thread(self._populate_thread_table, "table-threads", threads)
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    def _populate_email_table(
        self, table_id: str, tab_id: str, emails: list[Email], sent: bool = False
    ) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.clear()
        self._tab_emails[tab_id] = emails
        for e in emails:
            tags = ", ".join(e.tags) if e.tags else ""
            date = short_date(e.created_at)
            if sent:
                table.add_row(", ".join(e.to)[:20], e.subject[:40], date, tags, key=e.id)
            else:
                table.add_row(e.sender, e.subject[:40], date, tags, key=e.id)
        if emails:
            self._load_email_preview(emails[0].id)

    def _populate_thread_table(self, table_id: str, threads: list[Thread]) -> None:
        table = self.query_one(f"#{table_id}", DataTable)
        table.clear()
        self._tab_threads["threads"] = threads
        for t in threads:
            parts = ", ".join(t.participants)[:25]
            date = short_date(t.last_activity)
            table.add_row(t.subject[:30], parts, str(t.email_count), date, key=t.thread_id)
        if threads:
            self._load_thread_preview(threads[0].thread_id)

    # --- Preview ---

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        if event.row_key is None:
            return
        row_key = str(event.row_key.value)
        active_tab = self._active_tab()
        if active_tab == "threads":
            self._load_thread_preview(row_key)
        else:
            self._load_email_preview(row_key)

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        if event.row_key is None:
            return
        row_key = str(event.row_key.value)
        active_tab = self._active_tab()
        if active_tab == "threads":
            self._load_thread_preview(row_key)
        else:
            self._load_email_preview(row_key)

    @work(thread=True)
    def _load_email_preview(self, email_id: str) -> None:
        try:
            email = self.client.read(email_id)
            self.call_from_thread(self._show_email_preview, email)
        except EmcomError as e:
            self.call_from_thread(self._set_preview, f"Error: {e}")

    @work(thread=True)
    def _load_thread_preview(self, thread_id: str) -> None:
        try:
            emails = self.client.thread(thread_id)
            if emails:
                parts = []
                for e in emails:
                    parts.append(
                        f"From: {e.sender}  Date: {short_date(e.created_at)}\n"
                        f"{e.body}\n"
                    )
                text = f"Thread: {emails[0].subject}  ({len(emails)} emails)\n{'='*40}\n\n" + "\n---\n".join(parts)
                self.call_from_thread(self._set_preview, text)
            else:
                self.call_from_thread(self._set_preview, "Thread is empty.")
        except EmcomError as e:
            self.call_from_thread(self._set_preview, f"Error: {e}")

    def _show_email_preview(self, email: Email) -> None:
        cc = f"\nCC:      {', '.join(email.cc)}" if email.cc else ""
        tags = f"\nTags:    {', '.join(email.tags)}" if email.tags else ""
        text = (
            f"From:    {email.sender}\n"
            f"To:      {', '.join(email.to)}{cc}\n"
            f"Subject: {email.subject}\n"
            f"Date:    {short_date(email.created_at)}{tags}\n"
            f"ID:      {email.id}\n\n"
            f"{email.body}"
        )
        self._set_preview(text)

    def _set_preview(self, text: str) -> None:
        preview = self.query_one("#preview", Static)
        preview.update(text)

    # --- Actions ---

    def _active_tab(self) -> str:
        tabs = self.query_one("#tabs", TabbedContent)
        return tabs.active or "inbox"

    def _selected_row_key(self) -> str | None:
        active_tab = self._active_tab()
        table_id = f"table-{active_tab}"
        try:
            table = self.query_one(f"#{table_id}", DataTable)
        except Exception:
            return None
        if table.cursor_row is not None and table.row_count > 0:
            row_key = table.get_row_at(table.cursor_row)
            # get_row_at returns the row data, we need the key
            # Use coordinate to get key
            keys = list(table.rows.keys())
            if 0 <= table.cursor_row < len(keys):
                return str(keys[table.cursor_row].value)
        return None

    def _selected_email_id(self) -> str | None:
        """Get the email ID for the selected row (resolves thread → last email)."""
        active_tab = self._active_tab()
        row_key = self._selected_row_key()
        if not row_key:
            return None
        if active_tab == "threads":
            # For threads, we need to fetch the thread to get the last email
            return None  # handled separately
        return row_key

    def action_cursor_down(self) -> None:
        active_tab = self._active_tab()
        table_id = f"table-{active_tab}"
        try:
            table = self.query_one(f"#{table_id}", DataTable)
            table.action_cursor_down()
        except Exception:
            pass

    def action_cursor_up(self) -> None:
        active_tab = self._active_tab()
        table_id = f"table-{active_tab}"
        try:
            table = self.query_one(f"#{table_id}", DataTable)
            table.action_cursor_up()
        except Exception:
            pass

    def action_compose(self) -> None:
        def on_dismiss(result: Email | None) -> None:
            if result:
                self.notify(f"Sent [{result.id[:8]}] to {', '.join(result.to)}")
                self._load_tab(self._active_tab())

        self.push_screen(ComposeScreen(self.client), callback=on_dismiss)

    def action_reply(self) -> None:
        active_tab = self._active_tab()
        row_key = self._selected_row_key()
        if not row_key:
            self.notify("No email selected", severity="warning")
            return
        if active_tab == "threads":
            self._reply_to_thread(row_key)
        else:
            self._reply_to_email(row_key)

    @work(thread=True)
    def _reply_to_email(self, email_id: str) -> None:
        try:
            email = self.client.read(email_id)
            self.call_from_thread(self._open_reply_screen, email)
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    @work(thread=True)
    def _reply_to_thread(self, thread_id: str) -> None:
        try:
            emails = self.client.thread(thread_id)
            if emails:
                self.call_from_thread(self._open_reply_screen, emails[-1])
            else:
                self.call_from_thread(self.notify, "Thread is empty", severity="warning")
        except EmcomError as e:
            self.call_from_thread(self.notify, str(e), severity="error")

    def _open_reply_screen(self, email: Email) -> None:
        def on_dismiss(result: Email | None) -> None:
            if result:
                self.notify(f"Replied [{result.id[:8]}] in thread {result.thread_id[:8]}")
                self._load_tab(self._active_tab())

        self.push_screen(ReplyScreen(self.client, email), callback=on_dismiss)

    def action_who(self) -> None:
        self.push_screen(WhoScreen(self.client))

    def action_refresh(self) -> None:
        self._load_tab(self._active_tab())
        self.notify("Refreshed")


def main():
    import sys

    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")

    client = EmcomClient()
    app = EmcomApp(client)
    app.run()


if __name__ == "__main__":
    main()
