/**
 * Priority Dashboard View
 *
 * Displays tracked priorities from Claude-State-Tracking.md
 * with PIP coaching reminders and habit tracking.
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import AITriagePlugin from '../main';
import {
	DashboardState,
	DashboardTask,
	DashboardPipStatus,
	TodaysFocus
} from '../state-types';
import {
	StateLoader,
	isAfter2pmEastern,
	wasEodSentToday,
	formatDaysOverdue,
	formatDaysUntil,
	getTodayEastern
} from '../state-loader';
import { generateEODStatusDraft } from '../domain/eod-status';
import { EODDraftModal } from '../modals/eod-draft-modal';
import {
	identifyMiniReportCandidates,
	generateMiniReportTemplate,
	getReasonLabel
} from '../domain/mini-report';
import { MiniReportCandidate } from '../state-types';

export const PRIORITY_DASHBOARD_VIEW_TYPE = 'ai-priority-dashboard-view';

/**
 * Sidebar view displaying priority dashboard
 */
export class PriorityDashboardView extends ItemView {
	plugin: AITriagePlugin;
	private dashboardState: DashboardState | null = null;
	private taskChangeTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AITriagePlugin) {
		super(leaf);
		this.plugin = plugin;
		// Use the plugin's StateLoader instance for cache sharing
	}

	/**
	 * Get the StateLoader from the plugin for cache sharing
	 */
	private get stateLoader(): StateLoader {
		return this.plugin.stateLoader;
	}

	getViewType(): string {
		return PRIORITY_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Priority Dashboard';
	}

	getIcon(): string {
		return 'target';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('ai-priority-dashboard');

		// Initial load
		await this.refreshDashboard();

		// Set up auto-refresh if enabled (every 5 minutes)
		// registerInterval handles cleanup automatically on view close
		if (this.plugin.settings.autoRefreshDashboard) {
			const interval = window.setInterval(
				() => this.refreshDashboard(),
				5 * 60 * 1000
			);
			this.registerInterval(interval);
		}

		// Watch TaskNotes folder for status changes (instant refresh when marking tasks done)
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				try {
					if (file instanceof TFile && this.isTaskNoteFile(file)) {
						this.handleTaskNoteChange();
					}
				} catch (error) {
					console.error('Priority Dashboard: Error handling file modify event:', error);
				}
			})
		);
	}

	/**
	 * Check if a file is in the TaskNotes folder
	 */
	private isTaskNoteFile(file: TFile): boolean {
		const taskNotesFolder = this.plugin.settings.taskNotesFolder;
		return file.path.startsWith(taskNotesFolder + '/') || file.path === taskNotesFolder;
	}

	/**
	 * Handle TaskNote file changes with debouncing
	 */
	private handleTaskNoteChange(): void {
		if (this.taskChangeTimer !== null) {
			window.clearTimeout(this.taskChangeTimer);
		}
		this.taskChangeTimer = window.setTimeout(() => {
			this.render(); // Re-render to pick up status changes
			this.taskChangeTimer = null;
		}, 300);
	}

	async onClose(): Promise<void> {
		// registerInterval handles cleanup automatically
		// Only need to clean up the debounce timer
		if (this.taskChangeTimer !== null) {
			window.clearTimeout(this.taskChangeTimer);
		}
	}

	/**
	 * Refresh the dashboard by reloading state file
	 */
	async refreshDashboard(): Promise<void> {
		this.stateLoader.invalidateCache();
		this.dashboardState = await this.stateLoader.loadState(this.plugin.settings.stateFilePath);
		this.render();
	}

	/**
	 * Main render method
	 */
	private render(): void {
		this.contentEl.empty();

		const state = this.dashboardState;

		// Header
		this.renderHeader();

		// Error state
		if (state?.error) {
			this.renderError(state.error, state.warnings);
			return;
		}

		// Warnings banner (non-blocking)
		if (state?.warnings && state.warnings.length > 0) {
			this.renderWarnings(state.warnings);
		}

		if (!state) {
			this.renderError('Dashboard state not loaded');
			return;
		}

		// PIP Coaching Section (banner + habit tracker side-by-side at wider widths)
		if (state.pipStatus?.active && this.plugin.settings.showPipCoaching) {
			const coachingSection = this.contentEl.createDiv({ cls: 'coaching-section' });
			this.renderPipBanner(coachingSection, state.pipStatus);
			this.renderHabitTracker(coachingSection, state.pipStatus);
		}

		// Main content container
		const content = this.contentEl.createDiv({ cls: 'dashboard-content' });

		// Mini-Reports Needed (after coaching, before stats for visibility)
		if (this.plugin.settings.showPipCoaching && state.recentlyCompleted) {
			this.renderMiniReportSection(content, state);
		}

		// Summary stats
		this.renderSummaryStats(content, state);

		// Overdue Tasks
		if (state.overdueTasks.length > 0) {
			this.renderTaskSection(content, 'Overdue', state.overdueTasks, 'overdue');
		}

		// Due This Week
		if (state.dueThisWeek.length > 0) {
			this.renderTaskSection(content, 'Due This Week', state.dueThisWeek, 'due-soon');
		}

		// Due Next Week
		if (state.dueNextWeek.length > 0) {
			this.renderTaskSection(content, 'Due Next Week', state.dueNextWeek, 'upcoming');
		}

		// Today's Focus (replaces Stated Priorities - shows current_priorities data)
		this.renderTodaysFocus(content, state.todaysFocus, state.lastUpdated);

		// Footer with last updated
		this.renderFooter(state);
	}

	/**
	 * Render the header with title and refresh button
	 */
	private renderHeader(): void {
		const header = this.contentEl.createDiv({ cls: 'dashboard-header' });

		const titleRow = header.createDiv({ cls: 'dashboard-title-row' });
		titleRow.createEl('h4', { text: 'Priority Dashboard' });

		const refreshBtn = titleRow.createEl('button', {
			cls: 'dashboard-refresh-btn',
			attr: { 'aria-label': 'Refresh dashboard' }
		});
		refreshBtn.createSpan({ text: 'Refresh' });
		refreshBtn.addEventListener('click', async () => {
			refreshBtn.disabled = true;
			refreshBtn.addClass('refreshing');
			try {
				await this.refreshDashboard();
				new Notice('Dashboard refreshed');
			} catch (error) {
				new Notice('Failed to refresh dashboard');
			} finally {
				refreshBtn.disabled = false;
				refreshBtn.removeClass('refreshing');
			}
		});
	}

	/**
	 * Render error state
	 */
	private renderError(error: string, warnings?: string[]): void {
		const errorEl = this.contentEl.createDiv({ cls: 'dashboard-error' });
		errorEl.createEl('p', { text: error, cls: 'error-message' });

		if (warnings && warnings.length > 0) {
			const warningsList = errorEl.createEl('ul', { cls: 'error-warnings' });
			for (const warning of warnings) {
				warningsList.createEl('li', { text: warning });
			}
		}

		const hintEl = errorEl.createDiv({ cls: 'error-hint' });
		hintEl.createEl('p', {
			text: `Check that the state file exists at: ${this.plugin.settings.stateFilePath}`
		});
		hintEl.createEl('p', { text: 'You can change this path in plugin settings.' });
	}

	/**
	 * Render warnings banner (non-blocking)
	 */
	private renderWarnings(warnings: string[]): void {
		const banner = this.contentEl.createDiv({ cls: 'dashboard-warnings' });
		banner.createEl('strong', { text: 'Warnings:' });
		const list = banner.createEl('ul');
		for (const warning of warnings.slice(0, 3)) {
			list.createEl('li', { text: warning });
		}
		if (warnings.length > 3) {
			list.createEl('li', { text: `...and ${warnings.length - 3} more` });
		}
	}

	/**
	 * Render PIP status banner
	 */
	private renderPipBanner(container: HTMLElement, pip: DashboardPipStatus): void {
		const banner = container.createDiv({ cls: 'pip-banner' });

		// Title row
		const titleRow = banner.createDiv({ cls: 'pip-title-row' });
		titleRow.createSpan({
			text: `PIP Day ${pip.dayNumber} of ${pip.totalDays}`,
			cls: 'pip-day-count'
		});
		titleRow.createSpan({
			text: `Week ${pip.weekNumber} (${pip.currentPhase} Phase)`,
			cls: 'pip-phase'
		});

		// Progress bar
		const progressContainer = banner.createDiv({ cls: 'pip-progress-container' });
		const progressBar = progressContainer.createDiv({ cls: 'pip-progress-bar' });
		progressBar.style.width = `${pip.percentComplete}%`;
		progressContainer.createSpan({
			text: `${pip.percentComplete}%`,
			cls: 'pip-progress-label'
		});

		// Next check-in
		if (pip.nextCheckinDate && pip.daysUntilCheckin !== null) {
			banner.createDiv({
				text: `Next check-in: ${pip.nextCheckinDate} (${pip.daysUntilCheckin} days)`,
				cls: 'pip-checkin'
			});
		}

		// EOD reminder (check both state file and local tracking)
		const eodSentInStateFile = wasEodSentToday(pip);
		const eodSentLocally = this.wasEodSentTodayLocally();

		if (isAfter2pmEastern() && !eodSentInStateFile && !eodSentLocally) {
			const reminder = banner.createDiv({ cls: 'pip-reminder' });
			const reminderRow = reminder.createDiv({ cls: 'pip-reminder-row' });
			reminderRow.createSpan({ text: 'EOD status not sent today', cls: 'reminder-text' });

			const generateBtn = reminderRow.createEl('button', {
				text: 'Generate Draft',
				cls: 'pip-eod-draft-btn'
			});
			generateBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openEODDraftModal();
			});
		}
	}

	/**
	 * Check if EOD was sent today according to local tracking
	 */
	private wasEodSentTodayLocally(): boolean {
		const today = getTodayEastern();
		return this.plugin.settings.eodSentDates.includes(today);
	}

	/**
	 * Open the EOD draft modal
	 */
	private openEODDraftModal(): void {
		if (!this.dashboardState) {
			new Notice('Dashboard state not loaded');
			return;
		}

		const draft = generateEODStatusDraft(this.dashboardState);

		new EODDraftModal(
			this.app,
			draft,
			() => this.markEodAsSent()
		).open();
	}

	/**
	 * Mark EOD as sent for today in local settings
	 */
	private async markEodAsSent(): Promise<void> {
		const today = getTodayEastern();

		// Add to local tracking if not already there
		if (!this.plugin.settings.eodSentDates.includes(today)) {
			this.plugin.settings.eodSentDates.push(today);

			// Keep only last 30 days to prevent bloat
			if (this.plugin.settings.eodSentDates.length > 30) {
				this.plugin.settings.eodSentDates = this.plugin.settings.eodSentDates.slice(-30);
			}

			await this.plugin.saveSettings();
		}

		// Refresh the dashboard to hide the reminder
		this.render();
	}

	/**
	 * Public method to open EOD draft modal from command
	 * Called by main.ts command handler
	 */
	public openEODDraftModalFromCommand(): void {
		this.openEODDraftModal();
	}

	/**
	 * Render mini-report suggestions section
	 */
	private renderMiniReportSection(container: HTMLElement, state: DashboardState): void {
		// Collect already-sent reports from state file and local settings
		const sentFromState = this.extractSentReportsFromState(state);
		const sentManually = this.plugin.settings.miniReportsSentManually.map(s => s.taskFilename);
		const allSent = [...sentFromState, ...sentManually];

		// Identify candidates
		const candidates = identifyMiniReportCandidates(
			state.recentlyCompleted,
			this.plugin.settings.miniReportsDismissed,
			allSent
		);

		// Don't render section if no candidates
		if (candidates.length === 0) return;

		const section = container.createDiv({ cls: 'dashboard-section section-mini-reports' });

		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: `Mini-Reports Needed (${candidates.length})` });

		const list = section.createDiv({ cls: 'mini-report-list' });

		for (const candidate of candidates) {
			this.renderMiniReportCandidate(list, candidate);
		}
	}

	/**
	 * Render a single mini-report candidate
	 */
	private renderMiniReportCandidate(container: HTMLElement, candidate: MiniReportCandidate): void {
		const item = container.createDiv({ cls: 'mini-report-candidate' });

		// Left side: task info
		const infoDiv = item.createDiv({ cls: 'mini-report-info' });

		// Task name with reason badge
		const titleRow = infoDiv.createDiv({ cls: 'mini-report-title-row' });
		titleRow.createSpan({ text: candidate.taskName, cls: 'mini-report-task' });
		titleRow.createSpan({
			text: getReasonLabel(candidate.reason),
			cls: `mini-report-reason reason-${candidate.reason}`
		});

		// Client/date meta
		const metaRow = infoDiv.createDiv({ cls: 'mini-report-meta' });
		metaRow.createSpan({ text: candidate.client, cls: 'mini-report-client' });
		metaRow.createSpan({
			text: candidate.completedDate,
			cls: 'mini-report-date'
		});

		// Right side: action buttons
		const actionsDiv = item.createDiv({ cls: 'mini-report-actions' });

		// Create Template button
		const templateBtn = actionsDiv.createEl('button', {
			text: 'Template',
			cls: 'mini-report-btn mini-report-template-btn',
			attr: { 'aria-label': 'Copy mini-report template to clipboard' }
		});
		templateBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.copyMiniReportTemplate(candidate);
		});

		// Dismiss button
		const dismissBtn = actionsDiv.createEl('button', {
			text: '✕',
			cls: 'mini-report-btn mini-report-dismiss-btn',
			attr: { 'aria-label': 'Dismiss this suggestion' }
		});
		dismissBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.dismissMiniReportCandidate(candidate);
		});
	}

	/**
	 * Copy mini-report template to clipboard
	 * Uses modern Clipboard API only (no deprecated execCommand fallback)
	 */
	private async copyMiniReportTemplate(candidate: MiniReportCandidate): Promise<void> {
		const template = generateMiniReportTemplate(candidate);

		try {
			await navigator.clipboard.writeText(template);
			new Notice('Mini-report template copied to clipboard');
		} catch (error) {
			// Clipboard API failed - likely permissions issue
			console.error('Failed to copy to clipboard:', error);
			new Notice('Failed to copy to clipboard. Check browser permissions.');
		}
	}

	/**
	 * Dismiss a mini-report candidate
	 */
	private async dismissMiniReportCandidate(candidate: MiniReportCandidate): Promise<void> {
		// Add to dismissed list
		if (!this.plugin.settings.miniReportsDismissed.includes(candidate.filename)) {
			this.plugin.settings.miniReportsDismissed.push(candidate.filename);

			// Keep only last 100 to prevent bloat
			if (this.plugin.settings.miniReportsDismissed.length > 100) {
				this.plugin.settings.miniReportsDismissed =
					this.plugin.settings.miniReportsDismissed.slice(-100);
			}

			await this.plugin.saveSettings();
		}

		// Re-render to remove the candidate
		this.render();
	}

	/**
	 * Render summary statistics
	 */
	private renderSummaryStats(container: HTMLElement, state: DashboardState): void {
		const statsEl = container.createDiv({ cls: 'dashboard-stats' });

		const stats = [
			{ label: 'Total', value: state.summaryStats.totalTasks },
			{ label: 'Overdue', value: state.summaryStats.overdueCount, cls: 'stat-overdue' },
			{ label: 'This Week', value: state.summaryStats.dueThisWeek },
			{ label: 'Completed', value: state.summaryStats.completedTotal }
		];

		for (const stat of stats) {
			const statEl = statsEl.createDiv({ cls: `stat-item ${stat.cls || ''}` });
			statEl.createSpan({ text: String(stat.value), cls: 'stat-value' });
			statEl.createSpan({ text: stat.label, cls: 'stat-label' });
		}
	}

	/**
	 * Render a task section (Overdue, Due This Week, etc.)
	 * Returns the number of tasks actually rendered (after filtering completed)
	 */
	private renderTaskSection(
		container: HTMLElement,
		title: string,
		tasks: DashboardTask[],
		sectionClass: string
	): number {
		// Pre-filter to count how many tasks will actually render
		const activeTasks = tasks.filter(task => {
			const liveStatus = this.getLiveTaskStatus(task.filename);
			return !this.isTaskCompleted(liveStatus);
		});

		// Don't render section if all tasks are completed
		if (activeTasks.length === 0) {
			return 0;
		}

		const section = container.createDiv({ cls: `dashboard-section section-${sectionClass}` });

		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: `${title} (${activeTasks.length})` });

		const list = section.createDiv({ cls: 'task-list' });

		for (const task of activeTasks) {
			this.renderTaskItem(list, task, sectionClass);
		}

		return activeTasks.length;
	}

	/**
	 * Get the live status of a TaskNote from its frontmatter
	 * Returns null if file not found (falls back to state file status)
	 */
	private getLiveTaskStatus(filename: string): string | null {
		const file = this.findTaskNoteFile(filename);
		if (!file) return null;

		const cache = this.app.metadataCache.getFileCache(file);
		const status = cache?.frontmatter?.status;
		return typeof status === 'string' ? status.toLowerCase() : null;
	}

	/**
	 * Find a TaskNote file by filename, checking multiple path variations
	 */
	private findTaskNoteFile(filename: string): TFile | null {
		const taskNotesFolder = this.plugin.settings.taskNotesFolder;
		const paths = [
			`${taskNotesFolder}/${filename}`,
			filename,
			`${filename}.md`,
			`${taskNotesFolder}/${filename}.md`
		];

		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) return file;
		}
		return null;
	}

	/**
	 * Check if a status indicates the task is completed
	 */
	private isTaskCompleted(liveStatus: string | null): boolean {
		if (!liveStatus) return false;
		const normalized = liveStatus.toLowerCase().replace(/[_-]/g, '');
		return ['completed', 'done', 'closed'].includes(normalized);
	}

	/**
	 * Render a single task item
	 * Returns true if task was rendered, false if skipped (e.g., completed)
	 */
	private renderTaskItem(
		container: HTMLElement,
		task: DashboardTask,
		sectionClass: string
	): boolean {
		// Check live status from TaskNote file - skip if marked completed
		const liveStatus = this.getLiveTaskStatus(task.filename);
		if (this.isTaskCompleted(liveStatus)) {
			return false; // Task completed, don't render
		}

		const item = container.createDiv({
			cls: `task-item task-${sectionClass} task-priority-${task.priority}`
		});

		// Make the entire item clickable
		item.addEventListener('click', () => this.openTaskNote(task.filename));

		// Task title
		const titleRow = item.createDiv({ cls: 'task-title-row' });
		titleRow.createSpan({ text: task.title, cls: 'task-title' });

		// Priority badge
		if (task.priority === 'critical' || task.priority === 'high') {
			titleRow.createSpan({
				text: task.priority.toUpperCase(),
				cls: `task-priority-badge priority-${task.priority}`
			});
		}

		// Meta row (client, project, status)
		const metaRow = item.createDiv({ cls: 'task-meta-row' });
		metaRow.createSpan({ text: task.client, cls: 'task-client' });
		metaRow.createSpan({ text: task.project, cls: 'task-project' });

		if (task.status === 'waiting' && task.waitingOn) {
			metaRow.createSpan({
				text: `Waiting: ${task.waitingOn}`,
				cls: 'task-waiting'
			});
		}

		// Due date / overdue indicator
		const dateRow = item.createDiv({ cls: 'task-date-row' });
		if (task.daysOverdue > 0) {
			dateRow.createSpan({
				text: formatDaysOverdue(task.daysOverdue),
				cls: 'task-overdue'
			});
		} else if (task.dueDate) {
			const days = this.daysUntil(task.dueDate);
			dateRow.createSpan({
				text: `Due: ${task.dueDate} (${formatDaysUntil(days)})`,
				cls: 'task-due'
			});
		}

		return true; // Task was rendered
	}

	/**
	 * Render Today's Focus section (replaces Stated Priorities)
	 * Uses safe DOM methods to avoid XSS vulnerabilities
	 */
	private renderTodaysFocus(container: HTMLElement, focus: TodaysFocus | undefined, lastUpdated: string | null): void {
		// Skip if no focus data
		if (!focus || (!focus.immediateFocus && !focus.nextActions)) {
			return;
		}

		const section = container.createDiv({ cls: 'dashboard-section section-todays-focus' });

		// Header with staleness indicator
		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: "Today's Focus" });

		// Staleness check - warn if >12 hours old (fallback to lastUpdated if lastScanTime missing)
		const scanTime = focus.lastScanTime || lastUpdated;
		if (scanTime) {
			const scanDate = new Date(scanTime);
			const hoursSinceScan = (Date.now() - scanDate.getTime()) / (1000 * 60 * 60);
			if (hoursSinceScan > 12) {
				const staleEl = header.createSpan({
					text: ` (${Math.round(hoursSinceScan)}h old)`,
					cls: 'stale-indicator'
				});
				staleEl.setAttribute('aria-label', `Data is ${Math.round(hoursSinceScan)} hours old`);
				staleEl.setAttribute('role', 'status');
			}
		}

		// Immediate Focus
		if (focus.immediateFocus) {
			const focusDiv = section.createDiv({ cls: 'focus-immediate' });
			focusDiv.createEl('strong', { text: 'Immediate: ' });
			// Use safe DOM method to render formatted text
			this.renderFormattedText(focusDiv, focus.immediateFocus);
		}

		// Next Actions (if different from immediate focus)
		if (focus.nextActions && focus.nextActions !== focus.immediateFocus) {
			const actionsDiv = section.createDiv({ cls: 'focus-actions' });
			actionsDiv.createEl('strong', { text: 'Next Actions: ' });
			this.renderFormattedText(actionsDiv, focus.nextActions);
		}
	}

	/**
	 * Safely render text with markdown bold formatting
	 * Avoids XSS by using DOM methods instead of innerHTML
	 */
	private renderFormattedText(container: HTMLElement, text: string): void {
		// Split on bold markers, preserving the markers in results
		const parts = text.split(/(\*\*.+?\*\*)/g);

		for (const part of parts) {
			if (part.startsWith('**') && part.endsWith('**')) {
				// Bold text - strip markers and create strong element
				container.createEl('strong', { text: part.slice(2, -2) });
			} else if (part) {
				// Plain text
				container.createSpan({ text: part });
			}
		}
	}

	/**
	 * Render habit tracker section
	 */
	private renderHabitTracker(container: HTMLElement, pip: DashboardPipStatus): void {
		const section = container.createDiv({ cls: 'dashboard-section section-habits' });

		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: 'Habit Tracker' });

		// EOD Status row
		this.renderHabitRow(
			section,
			'EOD Status',
			pip.habits.eodStatus.thisWeek,
			pip.habits.eodStatus.count,
			pip.habits.eodStatus.target
		);

		// Morning Check row
		this.renderHabitRow(
			section,
			'Morning Check',
			pip.habits.morningCheck.thisWeek,
			pip.habits.morningCheck.count,
			pip.habits.morningCheck.target
		);
	}

	/**
	 * Render a single habit tracking row
	 */
	private renderHabitRow(
		container: HTMLElement,
		label: string,
		days: { date: string; done: boolean }[],
		count: number,
		target: number
	): void {
		const row = container.createDiv({ cls: 'habit-row' });

		row.createSpan({ text: label, cls: 'habit-label' });

		const checkboxes = row.createDiv({ cls: 'habit-checkboxes' });
		for (const day of days) {
			const checkbox = checkboxes.createSpan({
				cls: `habit-checkbox ${day.done ? 'done' : 'pending'}`
			});
			checkbox.setAttribute('title', day.date);
			checkbox.textContent = day.done ? '✓' : '○';
		}

		row.createSpan({
			text: `${count}/${target}`,
			cls: 'habit-count'
		});
	}

	/**
	 * Render footer with last updated timestamp and action buttons
	 */
	private renderFooter(state: DashboardState): void {
		const footer = this.contentEl.createDiv({ cls: 'dashboard-footer' });

		// Last updated timestamp
		if (state.lastUpdated) {
			footer.createSpan({
				text: `Last updated: ${state.lastUpdated}`,
				cls: 'last-updated'
			});
		}

		// Generate Report button (only when PIP is active)
		if (state.pipStatus?.active) {
			const buttonRow = footer.createDiv({ cls: 'footer-actions' });

			const generateBtn = buttonRow.createEl('button', {
				text: 'Generate weekly report',
				cls: 'dashboard-action-btn generate-report-btn'
			});
			generateBtn.addEventListener('click', async () => {
				generateBtn.disabled = true;
				generateBtn.textContent = 'Generating...';
				try {
					await this.plugin.generateWeeklyReport();
				} finally {
					generateBtn.disabled = false;
					generateBtn.textContent = 'Generate weekly report';
				}
			});
		}
	}

	/**
	 * Validate that a path doesn't contain path traversal sequences
	 */
	private isPathSafe(path: string): boolean {
		// Reject paths with traversal patterns
		if (path.includes('..') || path.includes('//')) {
			return false;
		}
		// Reject absolute paths (Windows or Unix)
		if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
			return false;
		}
		return true;
	}

	/**
	 * Open a TaskNote file
	 * Includes path traversal validation for security
	 */
	private async openTaskNote(filename: string): Promise<void> {
		// Security: Validate filename doesn't contain path traversal
		if (!this.isPathSafe(filename)) {
			console.warn('Blocked potentially unsafe filename:', filename);
			new Notice('Invalid filename');
			return;
		}

		// Try to find the file in the TaskNotes folder
		const taskNotesFolder = this.plugin.settings.taskNotesFolder;
		const possiblePaths = [
			`${taskNotesFolder}/${filename}`,
			filename,
			`${filename}.md`
		];

		for (const path of possiblePaths) {
			// Double-check each constructed path is safe
			if (!this.isPathSafe(path)) continue;

			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(file);
				return;
			}
		}

		// Try a vault-wide search (limited to matching filenames, not paths)
		const allFiles = this.app.vault.getFiles();
		const safeBasename = filename.replace('.md', '').replace(/[^\w\s-]/g, '');
		const match = allFiles.find(f => f.basename === safeBasename || f.path.endsWith(filename));
		if (match) {
			await this.app.workspace.getLeaf().openFile(match);
			return;
		}

		new Notice(`TaskNote not found: ${filename}`);
	}

	/**
	 * Calculate days until a date
	 */
	private daysUntil(dateStr: string): number {
		const target = new Date(dateStr);
		const now = new Date();
		target.setHours(0, 0, 0, 0);
		now.setHours(0, 0, 0, 0);
		const diffMs = target.getTime() - now.getTime();
		return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	}

	/**
	 * Extract sent report task names from state file
	 */
	private extractSentReportsFromState(state: DashboardState): string[] {
		if (!state.pipStatus) return [];

		const pipData = state.pipStatus as DashboardPipStatus & {
			miniReports?: { sentThisWeek?: { taskName: string }[] }
		};

		return pipData.miniReports?.sentThisWeek?.map(sent => sent.taskName) ?? [];
	}
}
