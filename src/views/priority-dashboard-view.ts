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
	StatedPriority
} from '../state-types';
import {
	StateLoader,
	isAfter2pmEastern,
	wasEodSentToday,
	formatDaysOverdue,
	formatDaysUntil
} from '../state-loader';

export const PRIORITY_DASHBOARD_VIEW_TYPE = 'ai-priority-dashboard-view';

/**
 * Sidebar view displaying priority dashboard
 */
export class PriorityDashboardView extends ItemView {
	plugin: AITriagePlugin;
	private stateLoader: StateLoader;
	private dashboardState: DashboardState | null = null;
	private refreshInterval: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AITriagePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.stateLoader = new StateLoader(this.app.vault);
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
		if (this.plugin.settings.autoRefreshDashboard) {
			this.refreshInterval = window.setInterval(
				() => this.refreshDashboard(),
				5 * 60 * 1000
			);
			this.registerInterval(this.refreshInterval);
		}
	}

	async onClose(): Promise<void> {
		if (this.refreshInterval !== null) {
			window.clearInterval(this.refreshInterval);
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

		// Stated Priorities
		if (state.statedPriorities.length > 0) {
			this.renderStatedPriorities(content, state.statedPriorities);
		}

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

		// EOD reminder
		if (isAfter2pmEastern() && !wasEodSentToday(pip)) {
			const reminder = banner.createDiv({ cls: 'pip-reminder' });
			reminder.createSpan({ text: 'EOD status not sent today', cls: 'reminder-text' });
		}
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
	 */
	private renderTaskSection(
		container: HTMLElement,
		title: string,
		tasks: DashboardTask[],
		sectionClass: string
	): void {
		const section = container.createDiv({ cls: `dashboard-section section-${sectionClass}` });

		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: `${title} (${tasks.length})` });

		const list = section.createDiv({ cls: 'task-list' });

		for (const task of tasks) {
			this.renderTaskItem(list, task, sectionClass);
		}
	}

	/**
	 * Render a single task item
	 */
	private renderTaskItem(
		container: HTMLElement,
		task: DashboardTask,
		sectionClass: string
	): void {
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
	}

	/**
	 * Render stated priorities section
	 */
	private renderStatedPriorities(container: HTMLElement, priorities: StatedPriority[]): void {
		const section = container.createDiv({ cls: 'dashboard-section section-stated-priorities' });

		const header = section.createDiv({ cls: 'section-header' });
		header.createEl('h5', { text: 'Stated Priorities (from Manager)' });

		const list = section.createDiv({ cls: 'priority-list' });

		for (const priority of priorities) {
			const item = list.createDiv({ cls: 'priority-item' });
			item.addEventListener('click', () => this.openTaskNote(priority.tasknote));

			const rankEl = item.createSpan({ text: `#${priority.rank}`, cls: 'priority-rank' });
			const taskEl = item.createSpan({ text: priority.task, cls: 'priority-task' });

			if (priority.deadline) {
				item.createSpan({
					text: `Due: ${priority.deadline}`,
					cls: 'priority-deadline'
				});
			}

			// Context on hover (title attribute)
			item.setAttribute('title', priority.context);
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
	 * Render footer with last updated timestamp
	 */
	private renderFooter(state: DashboardState): void {
		const footer = this.contentEl.createDiv({ cls: 'dashboard-footer' });

		if (state.lastUpdated) {
			footer.createSpan({
				text: `Last updated: ${state.lastUpdated}`,
				cls: 'last-updated'
			});
		}
	}

	/**
	 * Open a TaskNote file
	 */
	private async openTaskNote(filename: string): Promise<void> {
		// Try to find the file in the TaskNotes folder
		const taskNotesFolder = this.plugin.settings.taskNotesFolder;
		const possiblePaths = [
			`${taskNotesFolder}/${filename}`,
			filename,
			`${filename}.md`
		];

		for (const path of possiblePaths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(file);
				return;
			}
		}

		// Try a vault-wide search
		const allFiles = this.app.vault.getFiles();
		const match = allFiles.find(f => f.basename === filename.replace('.md', '') || f.path.endsWith(filename));
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
}
