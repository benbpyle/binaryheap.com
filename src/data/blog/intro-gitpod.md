---
title: intro_gitpod
author: "Benjamen Pyle"
description: "If you've been a developer long enough, you've encountered the excitement of cloning a new repository only to be quickly frustrated by not being able to get the code to compile or run on your machine."
pubDatetime: 2024-11-10T00:00:00Z
tags:
  - uncategorized
draft: true
---

## Introduction

If you've been a developer long enough, you've encountered the excitement of cloning a new repository only to be quickly frustrated by not being able to get the code to compile or run on your machine. For the longest time I've solved this challenge by using Docker and more specifically Docker Compose to provide a consistent way to build and test code locally. While not perfect, it is an improvement but is still lacking in so many ways. But what if there was way to have a consistent development environment that also allows for standardization and automation. Enter [Gitpod](https://shortclick.link/2taynj), a Cloud Development Environment built to solve just these problems.

As a PHP and Laravel developer, I often struggle with server versions, consistent file packaging, database migrations, and running resources locally to be able to accurately code and test my changes. In this article, I'm going to walk through a basic setup of how to turn a Laravel repository into a [Gitpod Project](https://shortclick.link/rzpuqh). From that Project, I'll highlight some features of using Gitpod's Flex to walkthrough local code changes and how any new developer can clone my repository and have a fully working local environment through the power of the Gitpod platform.

## Disclosure

But before we begin and for disclosure, [Gitpod](https://shortclick.link/2taynj) sponsored me to experiment with their product and report my findings. They have rented my attention, but not my opinion. Here is my unbiased view of my experience as a developer when setting up a Gitpod Workspace for coding on a PHP and Laravel application

## The Gitpod Problem

I've been a developer since the mid-1990s and have experienced all of the problems that Gitpod is solving. Problems like setting up a local development, getting a build, and shipping that build to a server (or cloud). These seem essential but there are other challenges beyond just the single developer experience. This below image is a fantastic visual for the space that the tooling is operating in.

![Gitpod Stack](/images/gitpod_stack.png)

With the tooling and the problems being established, let's jump into some code and see how Gitpod and Laravel play together with a local setup.

## Laravel Application

For the balance of the article, I'll be working with a basic Laravel Application that is using a SQLite database as its only external dependency. The full source code can be found in [this Github repository](https://shortclick.link/d72e7y)

### Getting Started

Normally when I kick off a Laravel project, I start with:

```bash
laravel new example-app
```

However, to take advantage of Gitpod, I need to be building in a containerized environment. To solve this, I'm leaning into [Sail](https://tinyurl.com/2dy4a5k6). Sail gives me a way to build my PHP application for a Docker environment and provides a generated `docker-compose.yml` that I can customize to my needs.

All of this is in support of building and interacting with my development enviornment in a DevContainer. DevContainers can be described like this:

> A development container (or dev container for short) allows you to use a container as a full-featured development environment. It can be used to run an application, to separate tools, libraries, or runtimes needed for working with a codebase, and to aid in continuous integration and testing. Dev containers can be run locally or remotely, in a private or public cloud, in a variety of supporting tools and editors -- DevContainers Website

If you aren't familiar with DevContainers, [here is the website](https://tinyurl.com/yckzkcdt) that can get you up to speed on why you should be paying attention and leveraging them.

In the context of Gipod, the DevContainer specification is natively integrated and is an integeral part of the developer experience. For my example, here's the `.devcontainers/devcontainer.json` in my project.

```json
{
  "name": "Existing Docker Compose (Extend)",
  "dockerComposeFile": ["../docker-compose.yml"],
  "service": "laravel.test",
  "workspaceFolder": "/var/www/html",
  "customizations": {
    "vscode": {
      "extensions": [],
      "settings": {}
    }
  },
  "remoteUser": "sail",
  "postCreateCommand": "chown -R 1000:1000 /var/www/html 2>/dev/null || true"
}
```

With the project setup, and the following custmomizations made, my simple application looks like the image below the bullets.

- Added a Todo Model
- Added a Todo Migration
- Added a Todo Seeder
- Customized the CSS and UI of the TodoView
- Modified the routes to point `/` at my TodoController which yields a list of Todos

![Demo](/images/demo.png)

### Diving into Gitpod

If you speak to a developer working on any application with more than 2 dependencies, they'll have the same common pains that they will tell you. Dependency management at the OS and library level can be a pain. Keeping an up to database that the application is congruent with takes work. And they often forget to run migrations and miss hours of their life realizing that they needed to run a migration. Or worse yet, they've joined a new team and lose many days to just getting the project configured.

Now take all of that and the work it takes to do things locally, and try and then bring that effort to the DevOps and Platform team. It's almost like starting over and can be a fragile dance of translation between local and cloud. Imagine being able to satisfy both the development team and the platform team. This is the problem and space that Gitpod lives in.

My example below is just going to scratch the surface. It is going to make use of PHP, Laravel, DevContainers, Gitpod's Flex, a local Gitpod Runner, and some basic Gitpod Automations. From there, I'll leave you with some next steps that you can take to accelerate your learning.

#### Gitpod Projects and Environments

Gitpod operates around Projects and Environments. My Project is connected directly to my Github repository that I shared above. In the the UI, that is represented in a Projects view.

![Projects](/images/projects.png)

Once I've established a Project, I can then create an Environment. Environments can have Runners which are where you container is hosted. For me, I'm running in a Local Runner, but this could easily be a Region in AWS where I'd get an EC2 server running in a VPC and Subnet of my choosing.

![Environments](/images/environments.png)

#### Local Runner

Once I've established these two basic constructs in Gitpod, I'm ready to launch my local environment. This is where the DevContainer comes in. Gitpod is going to read that specification which points back to a Docker Compose file that is going to launch the container that I can code in.

```dockerfile
services:
    laravel.test:
        build:
            context: './.devcontainer'
            dockerfile: Dockerfile
            args:
                WWWGROUP: '1000'
        image: 'sail-8.3/app'
        extra_hosts:
            - 'host.docker.internal:host-gateway'
        ports:
            - '${APP_PORT:-80}:80'
            - '${VITE_PORT:-5173}:${VITE_PORT:-5173}'
        environment:
            WWWUSER: '1000'
            LARAVEL_SAIL: 1
            XDEBUG_MODE: '${SAIL_XDEBUG_MODE:-off}'
            XDEBUG_CONFIG: '${SAIL_XDEBUG_CONFIG:-client_host=host.docker.internal}'
            IGNITION_LOCAL_SITES_PATH: '${PWD}'
        volumes:
            - '.:/var/www/html'
        networks:
            - sail
        depends_on: {  }
networks:
    sail:
        driver: bridge
```

When I click launch, and things go my way, I get the following image with all of these green cirlces. Red circles would be bad, and I'd have logs and insight into what might have gone wrong.

![Runner](/images/runners.png)

#### Automations

At this point, you might be wondering what those Services and Tasks are in the mid to bottom part of the image. Gitpod goes beyond just DevContainers and gives you the ability to customize the way things launch. Automations are powerful and more can be [read here.](https://shortclick.link/f5iavx)

Essentially, think of them like this. I get points in the launch where I can run commands against my container. For instance, maybe I want to run a DB Migration. Or perhaps I want to `compose` some dependencies for my Laravel application? These would be called Tasks.

But what about long running things like the PHP application itself? Those would be done via Services. And all of this automation happens by including a `.gitpod/automations.yaml` file in my project. In my case, it looks like the below. I opted for granularity vs doing them all in one Task just to visualize things better.

```yaml
services:
  php:
    name: Run PHP Serve
    triggeredBy: ["postDevcontainerStart"]
    commands:
      start: php artisan serve

tasks:
  copyEnv:
    name: Copy Environment
    description: Creates the .env file
    triggeredBy:
      - postEnvironmentStart
    command: cp .env.example .env
  appUrl:
    name: Mod App URL
    dependsOn: ["copyEnv"]
    triggeredBy:
      - postEnvironmentStart
    command: sed -i "s#APP_URL=http://localhost#APP_URL=$(gp url 8000)#g" .env
  viteUrl:
    name: Mod Vite URL
    dependsOn: ["copyEnv"]
    triggeredBy:
      - postEnvironmentStart
    command: sed -i "s#GITPOD_VITE_URL=#GITPOD_VITE_URL=$(gp url 5173)#g" .env
  composer:
    name: Install Dependencies
    dependsOn: ["copyEnv"]
    triggeredBy:
      - postEnvironmentStart
    description: Installs deps via composer
    command: composer install --ignore-platform-reqs
  createDatabase:
    name: Create Database
    triggeredBy:
      - postEnvironmentStart
    dependsOn: ["copyEnv"]
    command: touch database/database.sqlite
  phpOperations:
    name: Setup PHP and Run
    triggeredBy:
      - postEnvironmentStart
    dependsOn: ["copyEnv"]
    command: |
      php artisan key:generate
      php artisan storage:link
      php artisan migrate --seed
      php artisan db:seed --class=TodoSeeder
```

Amazing right?!? I can have these steps run when I launch my development environment. And any developer who has accesss to this project gets the same. And let's say that I need to change steps or worfkow, the next time I launch. Those just gets run. So much better than a README.md file that **might** be out of date.

#### Connecting to My Editor

When using the Gitpod Client, I can then connect my editor or a Terminal to my container. For this, I opted for VSCode because of its popularity. However, there is an integration for Jetbrains IDEs and I also can connect my favorite editor in Neovim via custom Dotfiles. The terminal developer in me is encouraged by this support and I plan to do some deeper dives in this area as I get time.

VSCode has two nice extensions for working with Gitpod and DevContainers. I found that once I launched my Gitpod Environment in VSCode, it was just like working with normal local development. Changes are available immediately and all of the normal Git operations perform just as I expected. And again, all of this is happening in a Container, so no worrying about local dependencies or "it works on my machine".

![Runner](/images/1_code.png)

The last piece of the puzzle is to make sure that I've got ports exposed to my container so that I can serve the traffic from the running Gitpod Service which is just `php artisan serve`. Once everything is in place, I'm able to serve the traffic in my browser that shows a PHP Laravel Application, backed by SQLite that was migrated and seeded as my Task automations specified.

And the great thing, I can share this with any teammate, and in the time it takes to pull the Gitpod and DevContainer resources, initialize, and launch, they'll have the same experience. There are just so many problems solved.

## Impressions and Thoughts

I hadn't spent a ton of time with CDEs in the past but I'm very impressed with what Gitpod is putting together. I think that the power lies in its repeatability and the ability to automate so many routine tasks in a consistent way that is not runtime specific is just magic.

I didn't get a chance in this article to explore running a Project in the Cloud, but from my exploration of the documentation, I can connect this same project to AWS via a generated CloudFormation template. And since Gitpod comes with a CLI, that same work I do locally, could be connected to an automated pipeline as part of a CI/CD process that can accelerate shipping value to customers.

I did have a couple of bumps along the way though. Gitpod just recently rolled out their Flex product which is what this article is based upon.

First, the documentation is good, but the tutorials left a little to be desired so I did have some figuring out of specific patterns and how the Client UI worked. Hopefully this article and the accompanying code saves you from some of those.

Second, the UI is very good for an early release but there are still some options lacking like refreshing my Git repository if I changed something fundamental. And I found that when dropping to the new CLI, I wasn't able to perform things that I thought I could from the documentation.

The bumps however are totally offset by the fact that the software works amazingly. And pair that with an active development cycle by Gitpod's Github repositories and things will only get better as Flex continues to take off. I am seriously impressed by the workflow and the time savings that this could provide a larger software development team.

## Wrapping Up

My goal with this piece was to provide a basic introduction to running a Laravel Application developed in Gitpod with DevContainers and the Flex UI Client. There's so much more to the ecosystem that is worth exploring. You could dive more into Gitpod, the DevContainers specification, or improve the base Dockerfiles that I'm working with in this project.

What I believe is powerful about the CDE approach is that as a developer, you could better partner with your Platform teams to share some of the burden of deployment and provisioning by using the abstractions that Gitpod provides. You also gain a high level of isolation and security by taking this approach. Environments can be isolated to workstations or servers. You can also make use of tenant level configurations. And lastly, every operation that you execute is vetted by credentials and authorizations within the Gitpod API.

Development is moving fast. This approach gives you the control and comfort that the foundations underneath your day to day are control, managed, and protected.

Thanks for reading and happy building!
