---
title: My Flow and Productivity has Improved with the Simplicity of Neovim
author: "Benjamen Pyle"
description: "I don't think it's a surprise if you've been following along with me lately that I've pivoted my daily programming setup to Neovim. What might surprise you is that I started my career working on HP-UX"
pubDatetime: 2024-06-21T00:00:00Z
tags:
  - productivity
  - programming
draft: false
---

I don't think it's a surprise if you've been following along with me lately that I've pivoted my daily programming setup to Neovim. What might surprise you is that I started my career working on HP-UX and remoting into servers because the compilers and toolchains only existed on those servers I was building for. When working through a terminal, you've got to leverage a terminal editor or do something with x11 and that was just super clunky. Enter my first experience with Vi. I loved the motions, the simplicity, and the ubiquity of it. But those are things that have been talked about in great detail. What I want to explore in this article is my experience in moving to Neovim.

## Why the Change

I've been working with code going back into the mid-90s across multiple operating systems and too many languages to keep track of. The question that many people have asked me is why would you "go back" to a terminal-based workflow. Almost as if to say it's a step backward. With tools like VSCode and Jetbrains (insert any of their editors), why jump into something that is a community port of something so old? Before I jump into the process of converting, here are my top 3 reasons.

1.  Simplification of my tooling. I need a Terminal Emulator and Neovim. With that setup, I can work on Rust, Go, TypeScript, HTML, YAML, and any language or markup that I encounter in my day-to-day job. No VSCode for this and Jetbrains for that. No switching between keybindings and the mouse. Now, I do have many plugins that enhance my Neovim experience, but at its core, my setup is 2 things.
2.  Improved flow and productivity. By staying in my terminal to work with Git, code, compilation, filesystems, and other pieces of my chain, I keep myself from having to jump out to another tool. The way my brain works, every time I jump, I lose flow. I lose my place. When I find my flow, I'm much more productive.
3.  Stripped-down experience. In a world where code documentation, auto-completion, and AI-code generation are taking over, I'm going back to just crafting things with hand tools. Sure, I have automation in my Neovim setup, but for me, when I have to hit the docs to read code, and then type that code in, it sticks in my brain better. This might not apply to you, but I was gifted with a great memory that is close to photogenic. My memory further cements when I see, and then type, write, or speak. By passing on some of the more fancy automation, I find myself learning more. I might not write as much code, but the code I write feels better crafted. No judgment here whatsoever, I'm simply stating how coding with Neovim makes me feel.

## What was My Experience Like?

With all of the above as the foundation for my move, where did I start? Honestly, not quite at the bottom but pretty close to it with TJ DeVries' [KickStart](https://github.com/nvim-lua/kickstart.nvim) project. I went down the path of wanting to understand exactly how my setup is working and only add in the plugins that I wanted. Looking back, I just didn't have the time to fully understand exactly what this meant. However, the act of failing with KickStart did give me some solid background in how Neovim, Lua, and Lazy (the plugin manager) work.

I honestly was at a breaking point a few weeks into my conversion and reached out to my friend [Rakesh](https://awsmantra.com/) that I was ready to give up. As much as I enjoyed the [Neovim Motions](https://www.barbarianmeetscoding.com/boost-your-coding-fu-with-vscode-and-vim/moving-blazingly-fast-with-the-core-vim-motions/), I just couldn't live with the discombobulated experience that I was getting. He rightly recommended that I give it another try, but this time with a prebuilt configuration. The Neovim world calls them "distros".

My first attempt at a distro was [NvChad](https://nvchad.com/). NvChad is well-liked, polished, and a really good place to start. I know as of this writing, Rakesh is still flying high with NvChad and enjoys it very much. Something about it felt too proprietary though. Custom loaders, dealing with packages in certain ways, and that sort of thing. I wanted something prebuilt but felt more like KickStart in that plugin adds and configurations felt more Neovim "native".

This leads me to where I am now with using [LazyVim](https://www.lazyvim.org/). Landing in LazyVim was exactly what I needed to start building my developer flow and productivity. It has some nice defaults, but the extensions and adding of plugins feel closer to what my journey started within KickStart. I'd like to spend the balance of the article walking through my workflow and favorite plugins.

## The Terminal

I don't want to skip over some foundational parts that are key to my development workflow and productivity. Neovim is the editor, but it starts with my terminal emulator AND terminal multiplexer.

I was a heavy and long-term user of iTerm2 coming into this change. I figured it would serve me just fine. And it did until it didn't. I noticed it starting to get a little bogged down as I was running tmux and now Neovim. More on tmux in a minute.

I tried Kitty. There was success but ultimately font rendering just felt off. I then moved over to Alacrity. Loved it, but found the configuration to be a little strange. So on the prompting of some other friends ([AJ](/images/which-key.png) and [Darko](https://x.com/darkosubotica)), Wezterm is where I landed. It honestly feels like a blend of all 3 of the previous ones I listed but yet still super snappy.

## Multiplex or Multiverse?

I said multiplexer didn't I? [tmux](https://github.com/tmux/tmux/wiki) to be exact. Another game-changer for me. The beauty of using tmux is that I can create sessions, panes, and windows that can then be moved, split, detached, and everything in between. I also have Neovim shortcuts built in so that I can easily move with `hjkl` which if you know Neovim, that's life.

[![tmux panes](/images/multi_windows.png)](/images/multi_windows.png)

With panes, I can split my terminal however I want, navigate between, hide, zoom, and dispatch right from the keyboard. Super powerful.

And if I want to have multiple windows going, I can switch with a keystroke that cycles through previous and next, by window number, or I get a selection screen.

[![tmux window selection](/images/session_view.png)](/images/session_view.png)

And as I mentioned, I can navigate with Neovim keybindings.

With tmux and Wezterm, I'm in a position to get my editor fired up.

## Neovim Tour and Plugins

This article could get pretty lengthy if I went all through my setup, configuration, and plugin usage. So the plan is, that I'm [sharing](https://github.com/benbpyle/dot-files) my dot-files and will touch on a few of the pieces I use or love the most.

What I enjoy the most about using Neovim is that my fingers are glued to the keyboard. It's getting to the point that I'm not even having to think about which key pairs do what. I can't understate how much that improves my flow and productivity. I don't want this to be a big Neovim vs VSCode vs IntelliJ as I know they all support Neovim bindings, but having specific keys for specific tasks that don't conflict with my Mac is so freeing.

So let's get into a tour, starting with the [Outline](https://github.com/hedyhli/outline.nvim) plugin.

### Outline

[![Neovim Outline](/images/outline.png)](/images/outline.png)

What I like about Outline is that I have a nice heads-up view of my file. I can see functions, structs, fields, properties, or whatever your language calls them. There's nothing magical about the plugin, but it does a great job of doing just what it says. Acting as an Outline. I have mine bound to the simple `<leader>o`. In Neovim, the `leader` key is a special key that you map to kick off commands. For me, I have `leader == space`.

### Trouble

In a similar spirit to Outline, there is a plugin called [Trouble](https://github.com/folke/trouble.nvim). This was created and maintained by the creator of LazyVim as well. Think of Trouble as having two functions for me.

Function one is to interact with the Language Server Protocol (LSP) in a way that yields diagnostics. Those error messages, warnings, and other items that show up. Trouble makes them available in a single window. A much broader topic is what is an LSP. Think of it as the brains behind many of the coding actions you find useful like symbol lookup, reference finding, and filling in your favorite struct of class.

The next thing that Trouble does is provide a view into all of the places a particular symbol is used. This is determined by my cursor position and looks like the image below.

[![](/images/trouble-1024x533.png)](/images/trouble.png)

With code organization covered, let's move into some functionality.

### Telescope

I don't think many Neovim users could live without [Telescope](https://github.com/nvim-telescope/telescope.nvim). Maintained by TJ DeVries, this is a fuzzy find, LSP integrator, and so many other things. I use it constantly to find open buffers, grep my codebase, look through Git logs, and pull up references. The image below shows how I'm using it to find Workspace Symbols.

[![Workspace Symbols](/images/find_symbol.png)](/images/find_symbol.png)

I could spend an entire article on just Telescope as it's something I could not live without. The best I can compare it to is the finder in IntelliJ that greps symbols, types, and other items. Only this can search through so much more.

### Code Completion and Types

Sometimes it's helpful to have code completion and an easy view of the types that you are working with. Coming from an IDE, these were things that I enjoyed and while I'm not super reliant on them, I still do use them.

Like many using Neovim, I'm leveraging the [Nvim-Cmp](https://github.com/hrsh7th/nvim-cmp) plugin. With this plugin, I get the snippets, code completion, and documentation on functions that I'm used to that help me out when my brain slows.

[![nvim-cmp](/images/completion.png)](/images/completion.png)

And while code completion is nice, sometimes I just want to see the hints of the type in-lay next to my variables. And with that latest version of Neovim, that's possible.

[![Hints](/images/2_image.png)](/images/2_image.png)

And, if hit `<leader>uh`, they disappear.

[![No Hints](/images/1_image-1.png)](/images/1_image-1.png)

So many options.

### Testing

The last three parts of my setup that I want to dive into speak specifically to functions that are integral to my build process.

1.  Git
2.  Unit Tests
3.  Debugging

#### Git

Using tmux, I could just have a shell to pivot into when I want to work with Git. Fine, and I could do that. But I'm using the Neovim plugin for [LazyGit](https://github.com/kdheepak/lazygit.nvim). Which takes advantage of this [LazyGit UI](https://github.com/jesseduffield/lazygit).

[![LazyGit](/images/lazygit.png)](/images/lazygit.png)

What I like about using LazyGit is that I can stay in my editor, and use my normal keybindings to navigate the buffer just like I do in every other buffer I work with. This whole journey wasn't about feature for feature, but how I could increase my flow and productivity. And staying in the terminal does that for me.

#### Testing

What developer flow is complete without a unit test runner? For that work, I rely on [Neotest](https://github.com/nvim-neotest/neotest). Neotest launches a Neovim buffer that sits on the side of my terminal. I don't have to pop up the summary. I can trigger Neotest in the background, get some notifications, and then move on. It also feels just like the other buffers I've mentioned above that can slide in and out as I need them.

[![Neotest](/images/neotest.png)](/images/neotest.png)

#### Debugging

The final piece of the experience for me was "Could I use a debugger in Neovim?". This was a big thing for me because I use a lot of [Rust](https://binaryheap.com/serverless-rust-developer-experience/) and Golang, and having a debugger available is critical. The Debugger Adapter Protocol or DAP can plug into popular debuggers like LLDB or GDB which then can be managed by a plugin called [DAP UI](https://github.com/rcarriga/nvim-dap-ui).

The UI is exactly what you'd think it would be. Symbols, threads, watches, breakpoints, and then the common Continue, Step Over, Step Out that you would be accustomed to. The below shows how I'm using it to debug a Rust Web API.

[![DAP UI](/images/1_image-6.png)](/images/1_image-6.png)

## Wrap Up Thoughts

I feel like I've written too little but my editor is showing me that I'm into the normal length article I've been producing lately. I could keep going, go back up, and dive deeper into the plugins, but I'm going to stop here. The point of this was to introduce my current setup, why I chose it, and what I'm doing with it. I am not using any other editor for my coding or debugging tasks. I still use VSCode to write my blog, because I like the Markdown preview mode and the Grammarly feature. I am toying with using LaTex and Neovim and seeing about a Markdown plugin, but I bounce so much while writing that my hand reaches for the mouse in natural ways. Maybe I'll switch in the future, but I'm not sure.

My closing thought though is that in a world that is looking for more instant gratification, more code, more output, and using AI to bounce prompts and thoughts off of, I like the feeling that I can read and write my code on purpose without distractions. Generated code is a distraction to me. I've said it before, but the act of learning is why I like coding, not the act of producing. Sure I love to finish things. But I love coding because it's an art to me. There is science for sure, but I like writing code like I like writing books and articles. I'm not in a rush to complete it and move to the next thing. I often romanticize the work I do. It's just who am.

And I'd be remiss if I didn't include links to my font and color scheme in case anyone is looking to make the switch.

-   Font - [Jetbrains Mono Nerdfont](https://www.programmingfonts.org/#jetbrainsmono) -- I can't get away from Jetbrains!
-   Colors - The soothing pastels for [Catppuccin](https://github.com/catppuccin/nvim)

And the last thing, if you ever get lost, [Which-Key](https://github.com/folke/which-key.nvim) is always there to help!

[![Which-Key](/images/which-key.png)](/images/which-key.png)

Thanks for reading and happy building!
