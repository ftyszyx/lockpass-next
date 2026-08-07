from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "apps" / "browser_extension" / "store-assets"
BACKGROUND_PATH = ROOT / "output" / "imagegen" / "chrome-store" / "lockpass-hero-base.png"
ICON_PATH = ASSET_DIR / "store-icon-128.png"

WIDTH = 1280
HEIGHT = 800

INK = "#121827"
MUTED = "#60738f"
TEAL = "#078a80"
TEAL_DARK = "#05786f"
TEAL_SOFT = "#dff3f0"
CORAL = "#ff6b65"
LINE = "#c5d3e1"
PANEL = "#ffffff"
SIDEBAR = "#edf5f4"


def load_font(size: int, bold: bool = False, chinese: bool = False) -> ImageFont.FreeTypeFont:
    if chinese:
        names = ["msyhbd.ttc" if bold else "msyh.ttc", "simhei.ttf"]
    else:
        names = ["seguisb.ttf" if bold else "segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf"]

    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def base_canvas() -> Image.Image:
    if BACKGROUND_PATH.exists():
        background = Image.open(BACKGROUND_PATH).convert("RGB")
    else:
        promo_path = ASSET_DIR / "promo-marquee-1400x560.png"
        promo = Image.open(promo_path).convert("RGB")
        background = promo.crop((700, 0, promo.width, promo.height))
    scale = max(WIDTH / background.width, HEIGHT / background.height)
    size = (round(background.width * scale), round(background.height * scale))
    background = background.resize(size, Image.Resampling.LANCZOS)
    left = (background.width - WIDTH) // 2
    top = (background.height - HEIGHT) // 2
    background = background.crop((left, top, left + WIDTH, top + HEIGHT))
    background = ImageEnhance.Contrast(background).enhance(0.72)
    veil = Image.new("RGBA", (WIDTH, HEIGHT), (248, 250, 252, 218))
    return Image.alpha_composite(background.convert("RGBA"), veil)


def rounded_shadow(canvas: Image.Image, box: tuple[int, int, int, int], radius: int = 18) -> None:
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1 + 3, y1 + 10, x2 + 3, y2 + 10), radius, fill=(25, 44, 67, 52))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(shadow)


def paste_icon(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    icon = Image.open(ICON_PATH).convert("RGBA")
    icon.thumbnail((box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS)
    x = box[0] + (box[2] - box[0] - icon.width) // 2
    y = box[1] + (box[3] - box[1] - icon.height) // 2
    canvas.alpha_composite(icon, (x, y))


def draw_brand(canvas: Image.Image, locale: str) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((68, 60, 126, 118), 16, fill=PANEL, outline=LINE, width=1)
    paste_icon(canvas, (76, 68, 118, 110))
    draw.text((140, 74), "LockPass", font=load_font(28, bold=True), fill=INK)
    subtitle = "浏览器扩展" if locale == "zh-CN" else "Browser Extension"
    draw.text(
        (141, 103),
        subtitle,
        font=load_font(12, chinese=locale == "zh-CN"),
        fill=MUTED,
    )


def draw_check(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    x, y = center
    draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill=TEAL)
    draw.line((x - 4, y, x - 1, y + 4), fill="white", width=2)
    draw.line((x - 1, y + 4, x + 5, y - 4), fill="white", width=2)


def draw_feature_list(
    draw: ImageDraw.ImageDraw,
    items: list[str],
    x: int,
    y: int,
    chinese: bool,
) -> None:
    font = load_font(17, chinese=chinese)
    for index, item in enumerate(items):
        row_y = y + index * 52
        draw_check(draw, (x + 11, row_y + 11))
        draw.text((x + 34, row_y), item, font=font, fill=INK)


def draw_search(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.ellipse((x, y, x + 12, y + 12), outline=MUTED, width=2)
    draw.line((x + 10, y + 10, x + 16, y + 16), fill=MUTED, width=2)


def draw_category_icon(draw: ImageDraw.ImageDraw, x: int, y: int, active: bool = False) -> None:
    color = TEAL if active else MUTED
    draw.rounded_rectangle((x, y, x + 13, y + 13), 3, outline=color, width=2)


def draw_item_row(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    initials: str,
    title: str,
    subtitle: str,
    selected: bool = False,
    chinese: bool = False,
) -> None:
    fill = TEAL_SOFT if selected else PANEL
    outline = "#63c7bd" if selected else LINE
    draw.rounded_rectangle(box, 10, fill=fill, outline=outline, width=1)
    x1, y1, _, _ = box
    draw.rounded_rectangle((x1 + 10, y1 + 12, x1 + 40, y1 + 42), 8, fill="#e6edf3")
    draw.text((x1 + 18, y1 + 20), initials, font=load_font(10, bold=True), fill="#456078")
    draw.text(
        (x1 + 50, y1 + 10),
        title,
        font=load_font(14, bold=True, chinese=chinese),
        fill=INK,
    )
    draw.text((x1 + 50, y1 + 31), subtitle, font=load_font(10), fill=MUTED)


def draw_field(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    label: str,
    value: str,
    chinese: bool,
) -> None:
    draw.text((x, y), label, font=load_font(12, chinese=chinese), fill=MUTED)
    draw.rounded_rectangle((x, y + 22, x + width, y + 84), 9, fill="#fbfcfd", outline=LINE, width=1)
    draw.text((x + 12, y + 44), value, font=load_font(14, chinese=chinese), fill=INK)


def generate_chinese() -> None:
    canvas = base_canvas()
    draw = ImageDraw.Draw(canvas)
    draw_brand(canvas, "zh-CN")

    draw.text((68, 195), "密码随手可用，", font=load_font(44, bold=True, chinese=True), fill=INK)
    draw.text((68, 254), "安全始终在线", font=load_font(44, bold=True, chinese=True), fill=INK)
    draw.text(
        (68, 331),
        "无需离开页面，即可匹配并填充保存的登录信息。",
        font=load_font(17, chinese=True),
        fill=MUTED,
    )
    draw_feature_list(
        draw,
        ["独立浏览器客户端", "自动生成强密码", "支持官方与自建服务器"],
        68,
        398,
        True,
    )

    panel = (500, 105, 1215, 696)
    rounded_shadow(canvas, panel)
    draw.rounded_rectangle(panel, 18, fill=PANEL, outline=LINE, width=1)

    draw.line((500, 163, 1215, 163), fill=LINE, width=1)
    draw.line((680, 163, 680, 696), fill=LINE, width=1)
    draw.line((910, 163, 910, 696), fill=LINE, width=1)

    paste_icon(canvas, (514, 116, 548, 151))
    draw.rounded_rectangle((557, 116, 883, 153), 9, fill="#f8fafc", outline=LINE, width=1)
    draw_search(draw, 572, 127)
    draw.text((595, 125), "搜索保险库", font=load_font(13, chinese=True), fill=MUTED)
    draw.rounded_rectangle((1103, 116, 1199, 153), 10, fill=TEAL)
    draw.text((1122, 125), "+  新建", font=load_font(13, bold=True, chinese=True), fill="white")

    draw.rectangle((500, 163, 680, 696), fill=SIDEBAR)
    draw.rounded_rectangle((514, 180, 549, 215), 10, fill=TEAL_DARK)
    draw.text((526, 188), "L", font=load_font(15, bold=True), fill="white")
    draw.text((559, 181), "demo@lockpass.app", font=load_font(13, bold=True), fill=INK)
    draw.text((559, 202), "个人保险库", font=load_font(10, chinese=True), fill=MUTED)

    categories = [("所有条目", "24"), ("登录", "12"), ("银行卡", "8"), ("笔记", "4")]
    for index, (label, count) in enumerate(categories):
        y = 240 + index * 43
        active = index == 1
        if active:
            draw.rounded_rectangle((508, y - 8, 672, y + 27), 9, fill="#d6eeea")
        draw_category_icon(draw, 516, y, active)
        draw.text((538, y - 3), label, font=load_font(13, chinese=True), fill=INK)
        draw.text((646, y - 2), count, font=load_font(10), fill=MUTED)

    draw.text((694, 181), "登录", font=load_font(17, bold=True, chinese=True), fill=INK)
    items = [
        ("G", "GitHub", "demo@lockpass.app"),
        ("G", "Google", "demo@lockpass.app"),
        ("CC", "Cloud Console", "admin@example.com"),
        ("E", "邮箱", "demo@lockpass.app"),
        ("PP", "Project Portal", "demo-user"),
    ]
    for index, item in enumerate(items):
        y = 215 + index * 70
        draw_item_row(draw, (689, y, 902, y + 62), *item, selected=index == 0, chinese=True)

    draw.text((928, 182), "GitHub", font=load_font(21, bold=True), fill=INK)
    draw.text((928, 216), "github.com", font=load_font(11), fill=MUTED)
    draw.rounded_rectangle((1125, 178, 1198, 212), 9, fill=TEAL)
    draw.text((1144, 187), "编辑", font=load_font(12, bold=True, chinese=True), fill="white")
    draw_field(draw, 928, 250, 270, "网站", "https://github.com", True)
    draw_field(draw, 928, 342, 270, "用户名", "demo@lockpass.app", True)
    draw_field(draw, 928, 434, 270, "密码", "************", True)
    draw.text((928, 530), "密码已安全保存在保险库中", font=load_font(12, chinese=True), fill=MUTED)

    canvas.convert("RGB").save(ASSET_DIR / "screenshot-zh-CN-1280x800.png", quality=95)


def generate_english() -> None:
    canvas = base_canvas()
    draw = ImageDraw.Draw(canvas)
    draw_brand(canvas, "en-US")

    headline = load_font(43, bold=True)
    draw.text((68, 196), "Secure sign-in,", font=headline, fill=INK)
    draw.text((68, 250), "right where", font=headline, fill=INK)
    draw.text((68, 304), "you need it.", font=headline, fill=INK)
    draw.text((68, 377), "Match and fill saved logins without", font=load_font(17), fill=MUTED)
    draw.text((68, 405), "leaving the page.", font=load_font(17), fill=MUTED)
    draw_feature_list(
        draw,
        ["Independent browser client", "Password generation", "Official or self-hosted server"],
        68,
        466,
        False,
    )

    browser = (500, 115, 1215, 680)
    rounded_shadow(canvas, browser)
    draw.rounded_rectangle(browser, 18, fill=PANEL, outline=LINE, width=1)
    draw.rectangle((500, 145, 1215, 164), fill="#f7f9fb")
    draw.ellipse((516, 132, 528, 144), fill=CORAL)
    draw.ellipse((536, 132, 548, 144), fill="#f0b429")
    draw.ellipse((556, 132, 568, 144), fill="#34c98f")
    draw.rounded_rectangle((605, 125, 1196, 153), 8, fill="#fbfcfd", outline=LINE, width=1)
    draw.text((622, 132), "https://accounts.example.com/sign-in", font=load_font(10), fill=MUTED)

    draw.text((555, 216), "Welcome back", font=load_font(29, bold=True), fill=INK)
    draw.text((555, 253), "Sign in to continue to your account", font=load_font(13), fill=MUTED)
    draw.text((555, 303), "Email", font=load_font(12, bold=True), fill=INK)
    draw.rounded_rectangle((555, 322, 886, 369), 9, fill="#fbfcfd", outline=LINE, width=1)
    draw.text((570, 338), "demo@lockpass.app", font=load_font(13), fill=INK)
    draw.text((555, 396), "Password", font=load_font(12, bold=True), fill=INK)
    draw.rounded_rectangle((555, 415, 886, 462), 9, fill="#fbfcfd", outline=TEAL, width=2)
    draw.text((570, 430), "************", font=load_font(14), fill=INK)
    paste_icon(canvas, (840, 422, 874, 455))
    draw.rounded_rectangle((555, 489, 886, 536), 9, fill=TEAL)
    draw.text((694, 505), "Sign in", font=load_font(13, bold=True), fill="white")

    popup = (918, 265, 1182, 506)
    draw.rounded_rectangle(popup, 15, fill=PANEL, outline="#66c7be", width=1)
    paste_icon(canvas, (934, 279, 970, 315))
    draw.text((978, 288), "LockPass", font=load_font(15, bold=True), fill=INK)
    draw.text((934, 330), "Suggested login", font=load_font(11, bold=True), fill=MUTED)
    draw.rounded_rectangle((930, 351, 1170, 420), 10, fill=TEAL_SOFT, outline="#67c8be", width=1)
    draw.rounded_rectangle((942, 366, 977, 401), 9, fill=TEAL_DARK)
    draw.text((952, 377), "EX", font=load_font(9, bold=True), fill="white")
    draw.text((988, 366), "Example Account", font=load_font(12, bold=True), fill=INK)
    draw.text((988, 389), "demo@lockpass.app", font=load_font(9), fill=MUTED)
    draw.rounded_rectangle((930, 436, 1170, 481), 9, fill=TEAL)
    draw.text((1002, 451), "Fill login", font=load_font(13, bold=True), fill="white")

    canvas.convert("RGB").save(ASSET_DIR / "screenshot-en-US-1280x800.png", quality=95)


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    generate_chinese()
    generate_english()
    print(f"Generated localized screenshots in {ASSET_DIR}")


if __name__ == "__main__":
    main()
