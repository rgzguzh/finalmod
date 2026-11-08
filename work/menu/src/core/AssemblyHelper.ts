import { Logger } from "../utils/Logger.js";

/** Resolves Unity/il2cpp images once, tolerating missing assemblies. */
export class AssemblyHelper {
    static CoreModule: Il2Cpp.Image | null = null;
    static TextMeshPro: Il2Cpp.Image | null = null;
    static AssemblyCSharp: Il2Cpp.Image | null = null;
    static Hazel: Il2Cpp.Image | null = null;

    static init(): void {
        this.CoreModule = this.image("UnityEngine.CoreModule");
        this.TextMeshPro = this.image("Unity.TextMeshPro");
        this.AssemblyCSharp = this.image("Assembly-CSharp");
        this.Hazel = this.image("Hazel");
        Logger.info("[AssemblyHelper] images resolved");
    }

    private static image(name: string): Il2Cpp.Image | null {
        try {
            return Il2Cpp.domain.assembly(name).image;
        } catch (e) {
            Logger.warn(`[AssemblyHelper] missing assembly ${name}: ${e}`);
            return null;
        }
    }

    /** Safe class lookup (returns null when the class does not exist in this build). */
    static cls(image: Il2Cpp.Image | null, name: string): Il2Cpp.Class | null {
        if (!image) return null;
        try {
            return image.class(name);
        } catch (e) {
            return null;
        }
    }
}
