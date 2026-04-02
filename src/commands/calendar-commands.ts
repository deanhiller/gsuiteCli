import { Command } from 'commander';
import { calendar_v3 } from 'googleapis';
import { getCalendar } from '../lib/google-client.js';
import { resolveAccount } from './account-resolver.js';

function formatDateTime(dateTime?: string | null, date?: string | null): string {
    if (dateTime) {
        const d = new Date(dateTime);
        return d.toLocaleString();
    }
    if (date) {
        return `${date} (all day)`;
    }
    return '(unknown)';
}

function formatEvent(event: calendar_v3.Schema$Event): void {
    const start: string = formatDateTime(event.start?.dateTime, event.start?.date);
    const end: string = formatDateTime(event.end?.dateTime, event.end?.date);
    const summary: string = event.summary ?? '(no title)';
    const id: string = event.id ?? '';

    console.log(`[${id}]`);
    console.log(`  Title: ${summary}`);
    console.log(`  Start: ${start}`);
    console.log(`  End:   ${end}`);
    if (event.location) {
        console.log(`  Location: ${event.location}`);
    }
    if (event.description) {
        console.log(`  Description: ${event.description}`);
    }
    if (event.attendees && event.attendees.length > 0) {
        const attendeeList: string = event.attendees
            .map((a) => `${a.email ?? ''}${a.responseStatus ? ` (${a.responseStatus})` : ''}`)
            .join(', ');
        console.log(`  Attendees: ${attendeeList}`);
    }
    if (event.hangoutLink) {
        console.log(`  Meet: ${event.hangoutLink}`);
    }
    console.log('');
}

/**
 * Parse a date or datetime string. Supports:
 *   - ISO 8601: "2026-04-02T14:00:00"
 *   - Date only: "2026-04-02" (treated as all-day)
 *   - Relative: "today", "tomorrow"
 */
function parseDateInput(input: string): { date?: string; dateTime?: string } {
    const lower = input.toLowerCase().trim();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (lower === 'today') {
        return { date: todayStr };
    }
    if (lower === 'tomorrow') {
        const tom = new Date(today);
        tom.setDate(tom.getDate() + 1);
        const ty = tom.getFullYear();
        const tm = String(tom.getMonth() + 1).padStart(2, '0');
        const td = String(tom.getDate()).padStart(2, '0');
        return { date: `${ty}-${tm}-${td}` };
    }

    // Date only: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return { date: input };
    }

    // Has a time component
    return { dateTime: new Date(input).toISOString() };
}

function startOfDay(dateStr?: string): string {
    if (dateStr) {
        return new Date(`${dateStr}T00:00:00`).toISOString();
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
}

function endOfDay(dateStr?: string): string {
    if (dateStr) {
        return new Date(`${dateStr}T23:59:59`).toISOString();
    }
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now.toISOString();
}

export function registerCalendarCommands(program: Command): void {
    const cal: Command = program.command('calendar').description('Google Calendar operations');

    // --- list / today ---
    cal
        .command('today')
        .description("List today's events")
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .action(async (opts: { account?: string; calendar: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            const resp = await client.events.list({
                calendarId: opts.calendar,
                timeMin: startOfDay(),
                timeMax: endOfDay(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = resp.data.items;
            if (!events || events.length === 0) {
                console.log('No events today.');
                return;
            }

            console.log(`Today's events (${events.length}):\n`);
            for (const event of events) {
                formatEvent(event);
            }
        });

    // --- list events for a date range ---
    cal
        .command('list')
        .description('List events in a date range')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .option('--from <date>', 'Start date (YYYY-MM-DD, "today", "tomorrow")', 'today')
        .option('--to <date>', 'End date (YYYY-MM-DD, "today", "tomorrow")')
        .option('-m, --max <number>', 'Max events', '50')
        .action(async (opts: { account?: string; calendar: string; from: string; to?: string; max: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);
            const maxResults: number = parseInt(opts.max, 10);

            const fromParsed = parseDateInput(opts.from);
            const fromDate: string = fromParsed.date ?? fromParsed.dateTime?.split('T')[0] ?? '';
            const toParsed = opts.to ? parseDateInput(opts.to) : undefined;
            const toDate: string | undefined = toParsed ? (toParsed.date ?? toParsed.dateTime?.split('T')[0]) : undefined;

            const resp = await client.events.list({
                calendarId: opts.calendar,
                timeMin: startOfDay(fromDate),
                timeMax: toDate ? endOfDay(toDate) : endOfDay(fromDate),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults,
            });

            const events = resp.data.items;
            if (!events || events.length === 0) {
                console.log('No events found.');
                return;
            }

            console.log(`Events (${events.length}):\n`);
            for (const event of events) {
                formatEvent(event);
            }
        });

    // --- get a single event ---
    cal
        .command('get')
        .argument('<eventId>', 'Event ID')
        .description('Get details of a specific event')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .action(async (eventId: string, opts: { account?: string; calendar: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            const resp = await client.events.get({
                calendarId: opts.calendar,
                eventId,
            });

            formatEvent(resp.data);
        });

    // --- create event ---
    cal
        .command('create')
        .description('Create a calendar event')
        .requiredOption('--title <title>', 'Event title')
        .requiredOption('--start <datetime>', 'Start (ISO datetime or YYYY-MM-DD for all-day)')
        .requiredOption('--end <datetime>', 'End (ISO datetime or YYYY-MM-DD for all-day)')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .option('--location <location>', 'Event location')
        .option('--description <text>', 'Event description')
        .option('--attendees <emails>', 'Comma-separated attendee emails')
        .option('--timezone <tz>', 'Timezone (e.g. America/New_York)')
        .action(async (opts: {
            title: string;
            start: string;
            end: string;
            account?: string;
            calendar: string;
            location?: string;
            description?: string;
            attendees?: string;
            timezone?: string;
        }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            const startParsed = parseDateInput(opts.start);
            const endParsed = parseDateInput(opts.end);

            const event: calendar_v3.Schema$Event = {
                summary: opts.title,
            };

            // All-day event
            if (startParsed.date && endParsed.date) {
                event.start = { date: startParsed.date };
                // Google Calendar all-day end date is exclusive, so add one day
                const endDate = new Date(endParsed.date);
                endDate.setDate(endDate.getDate() + 1);
                const ey = endDate.getFullYear();
                const em = String(endDate.getMonth() + 1).padStart(2, '0');
                const ed = String(endDate.getDate()).padStart(2, '0');
                event.end = { date: `${ey}-${em}-${ed}` };
            } else {
                const tz: string = opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
                event.start = { dateTime: startParsed.dateTime ?? `${startParsed.date}T00:00:00`, timeZone: tz };
                event.end = { dateTime: endParsed.dateTime ?? `${endParsed.date}T23:59:59`, timeZone: tz };
            }

            if (opts.location) {
                event.location = opts.location;
            }
            if (opts.description) {
                event.description = opts.description;
            }
            if (opts.attendees) {
                event.attendees = opts.attendees.split(',').map((e) => ({ email: e.trim() }));
            }

            const resp = await client.events.insert({
                calendarId: opts.calendar,
                requestBody: event,
                sendUpdates: opts.attendees ? 'all' : 'none',
            });

            console.log(`Created event: "${resp.data.summary}" (ID: ${resp.data.id})`);
            console.log(`  Link: ${resp.data.htmlLink}`);
        });

    // --- quick-add (natural language) ---
    cal
        .command('quick-add')
        .argument('<text>', 'Natural language event (e.g. "Lunch with Bob tomorrow at noon")')
        .description('Create event from natural language text')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .action(async (text: string, opts: { account?: string; calendar: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            const resp = await client.events.quickAdd({
                calendarId: opts.calendar,
                text,
            });

            console.log(`Created event: "${resp.data.summary}" (ID: ${resp.data.id})`);
            if (resp.data.start) {
                console.log(`  Start: ${formatDateTime(resp.data.start.dateTime, resp.data.start.date)}`);
            }
            console.log(`  Link: ${resp.data.htmlLink}`);
        });

    // --- edit/update event ---
    cal
        .command('edit')
        .argument('<eventId>', 'Event ID to edit')
        .description('Edit an existing event')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .option('--title <title>', 'New title')
        .option('--start <datetime>', 'New start')
        .option('--end <datetime>', 'New end')
        .option('--location <location>', 'New location')
        .option('--description <text>', 'New description')
        .option('--timezone <tz>', 'Timezone')
        .action(async (eventId: string, opts: {
            account?: string;
            calendar: string;
            title?: string;
            start?: string;
            end?: string;
            location?: string;
            description?: string;
            timezone?: string;
        }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            // Fetch current event
            const current = await client.events.get({
                calendarId: opts.calendar,
                eventId,
            });

            const patch: calendar_v3.Schema$Event = {};

            if (opts.title) {
                patch.summary = opts.title;
            }
            if (opts.location) {
                patch.location = opts.location;
            }
            if (opts.description) {
                patch.description = opts.description;
            }

            const tz: string = opts.timezone
                ?? current.data.start?.timeZone
                ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

            if (opts.start) {
                const startParsed = parseDateInput(opts.start);
                if (startParsed.date) {
                    patch.start = { date: startParsed.date };
                } else {
                    patch.start = { dateTime: startParsed.dateTime, timeZone: tz };
                }
            }
            if (opts.end) {
                const endParsed = parseDateInput(opts.end);
                if (endParsed.date) {
                    const endDate = new Date(endParsed.date);
                    endDate.setDate(endDate.getDate() + 1);
                    const ey = endDate.getFullYear();
                    const em = String(endDate.getMonth() + 1).padStart(2, '0');
                    const ed = String(endDate.getDate()).padStart(2, '0');
                    patch.end = { date: `${ey}-${em}-${ed}` };
                } else {
                    patch.end = { dateTime: endParsed.dateTime, timeZone: tz };
                }
            }

            if (Object.keys(patch).length === 0) {
                console.error('Error: Provide at least one field to update (--title, --start, --end, --location, --description).');
                process.exit(1);
            }

            const resp = await client.events.patch({
                calendarId: opts.calendar,
                eventId,
                requestBody: patch,
            });

            console.log(`Updated event: "${resp.data.summary}"`);
            formatEvent(resp.data);
        });

    // --- delete event ---
    cal
        .command('delete')
        .argument('<eventId>', 'Event ID to delete')
        .description('Delete a calendar event')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .option('--notify', 'Send cancellation notifications to attendees')
        .action(async (eventId: string, opts: { account?: string; calendar: string; notify?: boolean }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            await client.events.delete({
                calendarId: opts.calendar,
                eventId,
                sendUpdates: opts.notify ? 'all' : 'none',
            });

            console.log(`Deleted event ${eventId}.`);
        });

    // --- list calendars ---
    cal
        .command('calendars')
        .description('List all calendars in the account')
        .option('-a, --account <email>', 'Account to use')
        .action(async (opts: { account?: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);

            const resp = await client.calendarList.list();
            const calendars = resp.data.items;
            if (!calendars || calendars.length === 0) {
                console.log('No calendars found.');
                return;
            }

            for (const cal of calendars) {
                const primary: string = cal.primary ? ' (primary)' : '';
                console.log(`[${cal.id}] ${cal.summary ?? '(untitled)'}${primary}`);
                if (cal.description) {
                    console.log(`  ${cal.description}`);
                }
            }
        });

    // --- upcoming (next N events) ---
    cal
        .command('upcoming')
        .description('Show upcoming events')
        .option('-a, --account <email>', 'Account to use')
        .option('-c, --calendar <id>', 'Calendar ID (default: primary)', 'primary')
        .option('-m, --max <number>', 'Max events to show', '10')
        .action(async (opts: { account?: string; calendar: string; max: string }) => {
            const email: string = resolveAccount(opts.account);
            const client = getCalendar(email);
            const maxResults: number = parseInt(opts.max, 10);

            const resp = await client.events.list({
                calendarId: opts.calendar,
                timeMin: new Date().toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults,
            });

            const events = resp.data.items;
            if (!events || events.length === 0) {
                console.log('No upcoming events.');
                return;
            }

            console.log(`Upcoming events (${events.length}):\n`);
            for (const event of events) {
                formatEvent(event);
            }
        });
}
