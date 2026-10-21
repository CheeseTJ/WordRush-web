package top.taojun.eng;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 应用入口。
 *
 * 这里做三件事，都是为了消除「状态栏/导航栏白色」与「启动图色块」：
 *
 * 1. Android 15（API 35）起强制 edge-to-edge，系统会忽略 statusBarColor
 *    并把内容铺到状态栏下面。若不处理，WebView 的白色底会透到状态栏，
 *    而页面本身是米色，于是顶部出现一条白带。
 *    这里显式设置状态栏/导航栏为透明 + 深色图标，让页面的米色自然延伸到顶。
 *
 * 2. 用 setOnApplyWindowInsetsListener 把状态栏高度写成根容器的 padding，
 *    保证页面顶部内容不会被状态栏文字压住。前端 env(safe-area-inset-top)
 *    在 WebView 里取不到真实值，必须由原生侧补上。
 *
 * 3. 系统栏图标固定深色，因为 App 永远是浅色粘土风。
 */
public class MainActivity extends BridgeActivity {

    /** 与 res/values/colors.xml 的 brand_cream 一致 */
    private static final int BRAND_CREAM = Color.parseColor("#FFF6EA");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 让内容延伸到系统栏区域，边距由下面的 insets 监听补
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 系统栏透明：底下露出的就是窗口背景（已设为米色）
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        // 兜底：部分 ROM 在透明状态下仍会画一层默认色
        getWindow().getDecorView().setBackgroundColor(BRAND_CREAM);

        // App 固定浅色主题，系统栏图标必须是深色才看得清
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        // 关键：WebView 本身【不加 padding】，让它铺满整个屏幕（含状态栏区域），
        // 这样网页的渐变背景会一直画到屏幕顶端，与状态栏无缝融合。
        // 安全区数值改为通过 CSS 变量下发给网页，由网页自己给内容留出边距——
        // 给 WebView 加 padding 会让背景从状态栏下方才开始画，造成顶部一条色带。
        View webView = findViewById(R.id.webview);
        if (webView == null) {
            webView = findViewById(android.R.id.content);
        }
        final WebView target = webView instanceof WebView ? (WebView) webView : null;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());

            // 单位换算：px → CSS px（dp）。WebView 的 CSS 像素按 density 缩放，
            // 不做换算的话在高密度屏上边距会偏大几倍。
            float density = getResources().getDisplayMetrics().density;
            int top = Math.round(bars.top / density);
            int bottom = Math.round(bars.bottom / density);
            int left = Math.round(bars.left / density);
            int right = Math.round(bars.right / density);

            // 注入 CSS 变量。网页侧用 var(--safe-top) 等消费，缺省 0px。
            String js = String.format(
                    "(function(){var s=document.documentElement.style;"
                            + "s.setProperty('--safe-top','%dpx');"
                            + "s.setProperty('--safe-bottom','%dpx');"
                            + "s.setProperty('--safe-left','%dpx');"
                            + "s.setProperty('--safe-right','%dpx');"
                            + "})()",
                    top, bottom, left, right);
            if (target != null) {
                target.post(() -> target.evaluateJavascript(js, null));
            }

            // 不消费 insets：让 WebView 继续铺满，同时也别让系统再给我们加内边距
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
