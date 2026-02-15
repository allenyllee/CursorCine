{
  "targets": [
    {
      "target_name": "windows_wgc_hdr_capture",
      "sources": ["src/addon.cc"],
      "conditions": [
        ["OS=='win'", {
          "defines": ["NOMINMAX", "WIN32_LEAN_AND_MEAN"]
        }]
      ]
    }
  ]
}
