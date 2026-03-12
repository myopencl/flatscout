# FlatScout - Examples

Here are common ways to invoke the `createMap` skill.

## 1. Refresh Main Map
```bash
./scripts/update_and_deploy.sh
```

## 2. Generate Map for 2-room apartments
```bash
./scripts/update_and_deploy.sh --name "2hab" --rooms 2
```

## 3. Generate Map for "Visited" apartments
```bash
./scripts/update_and_deploy.sh --name "visitados" --status VISITED
```

## 4. Complex Filter (3 rooms + Found status)
```bash
./scripts/update_and_deploy.sh --name "3hab_found" --rooms 3 --status FOUND
```

## 5. Check Deployment Status
Logs are available at `logs/flatscout-deploy.log`.
Check GitHub Actions/Pages status on `https://github.com/myopencl/flatscout/actions`.
