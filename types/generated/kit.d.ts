declare namespace _default {
    let reference: string;
    let generated_by: string;
    let version: string;
    let help: {
        "": string;
        list: string;
        describe: string;
        get: string;
        set: string;
        help: string;
        completion: string;
    };
    namespace completion {
        let bash: string;
        let zsh: string;
        let fish: string;
        let powershell: string;
    }
}
export default _default;
