{
  "targets": [
    {
      "target_name": "windows_overlay_host",
      "sources": [
        "src/addon.cc"
      ],
      "cflags_cc": [
        "-std=c++17"
      ],
      "defines": [
        "NOMINMAX",
        "WIN32_LEAN_AND_MEAN"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": [
                  "/std:c++17"
                ]
              }
            }
          }
        ]
      ]
    }
  ]
}
