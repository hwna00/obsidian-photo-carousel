import { Plugin, PluginSettingTab, Setting, TFile, App } from "obsidian";
import EmblaCarousel, { EmblaCarouselType } from "embla-carousel";

interface CarouselSettings {
	defaultHeight: string; // e.g. "300px"
	defaultLoop: boolean;
	transitionMs: number;
}

const DEFAULT_SETTINGS: CarouselSettings = {
	defaultHeight: "300px",
	defaultLoop: true,
	transitionMs: 250,
};

export default class CarouselPlugin extends Plugin {
	/** 현재 설정값 */
	public settings!: CarouselSettings;
	/** 활성화된 Embla 인스턴스 모음 (언로드 시 destroy) */
	private activeEmbla: EmblaCarouselType[] = [];
	/** 폴더별 이미지 캐시 */
	private folderCache: Map<string, string[]> = new Map();

	/* ------------------------------------------------------------------ */
	/*  ▒▒  LIFECYCLE  ▒▒                                                */
	/* ------------------------------------------------------------------ */
	async onload() {
		// console.log("[Carousel] loading plugin");

		await this.loadSettings();

		/** Markdown 코드블록 프로세서 등록 */
		this.registerMarkdownCodeBlockProcessor(
			"carousel",
			async (source, el, ctx) => {
				const cfg = this.parseParams(source);
				await this.renderCarousel(cfg, el, ctx.sourcePath);
			}
		);

		/** 설정 탭 추가 */
		this.addSettingTab(new CarouselSettingTab(this.app, this));

		/** 코드블록 삽입 커맨드 */
		this.addCommand({
			id: "insert-carousel-block",
			name: "Insert carousel block",
			editorCallback: (editor) => {
				editor.replaceSelection(
					[
						"```carousel",
						`folder: assets`,
						`height: ${this.settings.defaultHeight}`,
						`loop: ${this.settings.defaultLoop}`,
						`transitionMs: ${this.settings.transitionMs}`,
						"```",
						"",
					].join("\n")
				);
			},
		});
	}

	async onunload() {
		this.activeEmbla.forEach((e) => e && e.destroy());
		this.activeEmbla.length = 0;
		this.folderCache.clear();
		// console.log("[Carousel] unloading plugin");
	}

	/* ------------------------------------------------------------------ */
	/*  ▒▒  CORE LOGIC  ▒▒                                               */
	/* ------------------------------------------------------------------ */

	/**
	 * 코드블록 파라미터 파싱
	 * key: value 형식, 공백 허용
	 */
	private parseParams(raw: string): {
		folder: string;
		height: string;
		loop: boolean;
		transitionMs: number;
	} {
		const lines = raw
			.split(/\n|\r/)
			.map((l) => l.trim())
			.filter(Boolean);
		const params: Record<string, string> = {};
		for (const line of lines) {
			const match = line.match(/^([^:]+):\s*(.+)$/);
			if (match) params[match[1].toLowerCase()] = match[2];
		}
		return {
			folder: params["folder"] ?? "",
			height: params["height"] ?? this.settings.defaultHeight,
			loop:
				params["loop"] !== undefined
					? params["loop"].toLowerCase() === "true"
					: this.settings.defaultLoop,
			transitionMs:
				params["transitionMs"] !== undefined
					? parseInt(params["transitionMs"]) || // eslint-disable-next-line no-mixed-spaces-and-tabs
					  this.settings.transitionMs
					: this.settings.transitionMs,
		};
	}

	/** 캐러셀 DOM 렌더링 */
	private async renderCarousel(
		cfg: {
			folder: string;
			height: string;
			loop: boolean;
			transitionMs: number;
		},
		el: HTMLElement,
		sourcePath: string
	) {
		const folderPath = this.resolveFolderPath(cfg.folder, sourcePath);
		const imgPaths = await this.getImagePaths(folderPath);
		if (imgPaths.length === 0) {
			el.createEl("p", { text: `No images found in ${folderPath}` });
			return;
		}

		/* Wrapper */
		const wrapper = el.createEl("div", {
			cls: "obs-carousel",
		});
		wrapper.style.setProperty("--carousel-height", cfg.height);

		const viewport = wrapper.createDiv({ cls: "embla__viewport" });
		const container = viewport.createDiv({ cls: "embla__container" });

		for (const path of imgPaths) {
			const slide = container.createDiv({ cls: "embla__slide" });
			slide.createEl("img", {
				attr: {
					src: this.app.vault.getResourcePath({
						path,
					} as TFile),
				},
			});
		}

		const embla = EmblaCarousel(viewport, {
			loop: cfg.loop,
			// speed: this.settings.transitionMs,
			align: "center",
		});
		this.activeEmbla.push(embla);
	}

	/** 지정 폴더의 이미지 경로 배열 가져오기 (캐시 활용) */
	private async getImagePaths(folder: string): Promise<string[]> {
		const folderPath = folder.slice(1);

		const cached = this.folderCache.get(folderPath);
		if (cached) return cached;

		const files = this.app.vault.getFiles().filter((f) => {
			return (
				f.path.startsWith(folderPath) &&
				/\.(png|jpe?g|gif|webp)$/i.test(f.path) // ← 파일 전체 경로로 검사
			);
		});
		const paths = files.map((f) => f.path);
		this.folderCache.set(folderPath, paths);
		return paths;
	}

	/** 코드블록 folder 파라미터를 절대 경로로 변환 */
	private resolveFolderPath(folder: string, sourcePath: string): string {
		if (!folder)
			return sourcePath.substring(0, sourcePath.lastIndexOf("/"));
		// 절대경로면 그대로, 상대경로면 소스 기준
		return folder.startsWith("/")
			? folder.slice(1)
			: `${sourcePath.substring(
					0,
					sourcePath.lastIndexOf("/")
					// eslint-disable-next-line no-mixed-spaces-and-tabs
			  )}/${folder}`;
	}

	/* ------------------------------------------------------------------ */
	/*  ▒▒  SETTINGS  ▒▒                                                 */
	/* ------------------------------------------------------------------ */

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/* ------------------------------------------------------------------ */
/*  ▒▒  SETTINGS TAB CLASS  ▒▒                                         */
/* ------------------------------------------------------------------ */

class CarouselSettingTab extends PluginSettingTab {
	constructor(public app: App, private plugin: CarouselPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Carousel Plugin Settings" });

		/* defaultHeight */
		new Setting(containerEl)
			.setName("Default height")
			.setDesc("CSS height value e.g. 300px, 25rem, 50vh")
			.addText((text) =>
				text
					.setPlaceholder("300px")
					.setValue(this.plugin.settings.defaultHeight)
					.onChange(async (value) => {
						this.plugin.settings.defaultHeight =
							value.trim() || "300px";
						await this.plugin.saveSettings();
					})
			);

		/* defaultLoop */
		new Setting(containerEl)
			.setName("Loop by default")
			.setDesc("Whether carousel should loop if parameter omitted")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.defaultLoop)
					.onChange(async (value) => {
						this.plugin.settings.defaultLoop = value;
						await this.plugin.saveSettings();
					})
			);

		/* transitionMs */
		new Setting(containerEl)
			.setName("Transition speed (ms)")
			.setDesc("Slide transition duration in milliseconds")
			.addText((text) =>
				text
					.setPlaceholder("250")
					.setValue(String(this.plugin.settings.transitionMs))
					.onChange(async (value) => {
						const ms = parseInt(value);
						if (!isNaN(ms) && ms > 0) {
							this.plugin.settings.transitionMs = ms;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}
